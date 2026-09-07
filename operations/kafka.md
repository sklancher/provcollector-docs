---
title: Kafka topics and ACLs
parent: Operations
nav_order: 2
permalink: /operations/kafka/
---

# Kafka topics and ACLs
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Created and configured by the `redpanda-init` container, which runs once at
startup and then exits.

## Topics

| Topic | Partitions | Cleanup | Retention |
| --- | --- | --- | --- |
| `RawEvents` | 10 | delete | 1 day |
| `ProcessedEvents` | 10 | delete | 1 day |
| `IdentityChangelog` | 10 | **compact** | infinite |

{: .invariant }
> `IdentityChangelog` must have the **same partition count** as `RawEvents`.
> Entries are produced to the same partition as the event that caused them, so a
> mismatch would make a restoring node read the wrong slice of the log and
> rebuild an incorrect identity state.

{: .note }
> Retention on the event topics is one day, providing a replay window rather than
> an archive; PostgreSQL is the durable store. A processor more than a day behind
> has lost events permanently, and the remedy is capacity rather than retention.

## Keying and partitioning

Events are keyed by **agent id**. Every event from one host lands on one
partition, which is what makes the whole downstream design work:

- One processor instance sees an agent's entire history, so the reordering buffer
  and the identity state for that agent need no coordination with any other
  instance.
- Per-agent state needs no locking, because agent ids are hashed to workers
  inside the processor as well.
- `IdentityChangelog` co-partitioning means a node restoring after a restart or a
  rebalance replays exactly the identities belonging to the partitions it owns.

The partition count therefore caps parallelism: ten partitions means at most ten
useful processor instances, and an agent is never split across two.

## Compaction

`IdentityChangelog` is compacted rather than time-retained, since it records
state rather than events. Record keys carry the entry type so that tombstones
remain interpretable:

```
id:{agent_uuid}:{identity_uuid}   -> TrackedIdentity
boot:{agent_uuid}                 -> AgentBoot
```

A null value is a tombstone: the identity was destroyed or evicted.
`NullTolerantProtobufSerdes` exists for exactly this case — the stock Protobuf
deserialiser throws on a record with a key and no value.

## ACLs

One principal per role, each narrowed to what that role needs:

| Principal | Grants |
| --- | --- |
| `agent` | write/describe/create on `RawEvents`; idempotent-write on the cluster |
| `eventprocessor` | read on `RawEvents`; write on `ProcessedEvents`; read+write on `IdentityChangelog`; read on any consumer group |
| `database` | read/describe on `ProcessedEvents`; read on any consumer group |
| `throughputmon` | read/describe on `RawEvents` and `ProcessedEvents`; read on any consumer group |
| `admin` | superuser; full access to `_schemas` |

{: .rationale }
> An agent credential recovered from a monitored host permits event injection. It
> does not permit reading the stream back, reaching `ProcessedEvents`, or
> modifying identity state. The credential that necessarily resides on every
> untrusted endpoint is the least privileged in the system.

## Transport

TLS with SASL/SCRAM-SHA-256 throughout. Agent SASL credentials are stored
encrypted at rest in the config file and decrypted at startup by a
`PostConfigure<KafkaOptions>` hook — DPAPI on Windows,
`PlatformCredentialsProtector` on Linux. `IsProtected` recognises the wrapped
form, so a plaintext value in a development config still works.

## Consumer configuration

The event processor consumes with `EnableAutoCommit: false` and commits offsets
explicitly on `OffsetCommitInterval` (default 5 s), but only up to the watermark
below which every earlier event has actually been *emitted*.

{: .rationale }
> Auto-commit would acknowledge events still held in the reordering buffer, and a
> crash would lose them. `OffsetCommitInterval` controls commit frequency; the
> watermark is what bounds commit lag.

## Inspecting the stream

The Redpanda Console on port 443 browses topics, consumer groups and individual
messages. For a live rate view rather than message-level inspection, the
ThroughputMonitor on port 8083 consumes the selected topic directly and
broadcasts aggregated rates over SignalR; `TopicStateCoordinator` lets you switch
the monitored topic at runtime without restarting the service.
