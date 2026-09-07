---
title: ProvCollector.Backend
parent: Components
nav_order: 3
permalink: /components/backend/
---

# ProvCollector.Backend
{: .no_toc }

The two services between the agents and the database.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Both are console-host worker services (`net10.0`) that run as containers in the
Compose stack.

| Project | Consumes | Produces |
| --- | --- | --- |
| `ProvCollector.EventProcessor` | `RawEvents` | `ProcessedEvents`, `IdentityChangelog` |
| `ProvCollector.Database.Postgres.Writer` | `ProcessedEvents` | PostgreSQL `nodes` / `edges` |

## ProvCollector.EventProcessor

Reorders events and resolves object identities. Every downstream stage depends
on the correctness of this service.

### Pipeline

`EventProcessorService` is a `BackgroundService` that:

1. Consumes `RawEvents` with `EnableAutoCommit: false`.
2. Hashes each event's agent id to one of N `ProcessingWorker`s
   (N = `WorkerThreads`, or `Environment.ProcessorCount` when 0), each with its
   own unbounded channel. One agent always maps to one worker, so per-agent state
   needs no locking.
3. Buffers per agent in a priority queue ordered on `agent_monotonic_time`,
   emitting only once `BufferLimit` is exceeded or `FlushTimeout` elapses with no
   new events.
4. Runs each emitted event through the configured processor chain.
5. Produces the result to `ProcessedEvents`.
6. Commits offsets on `OffsetCommitInterval`, but only up to the watermark
   (`OffsetWatermarkTracker`) below which every event has actually been emitted.

{: .rationale }
> Step 6 ensures that a crash loses nothing that has been acknowledged.
> Auto-commit would acknowledge events still held in the reordering buffer.

### Processor chain

Processors implement `IEventProcessor` and are registered as keyed services, then
selected by name in `EventProcessor:Processors`.
`EventProcessorPipelineSorter` topologically sorts them using `[DependsOn]`
attributes, so ordering constraints are declared rather than positional. A name
in the config with no matching registration causes startup to fail.

`IdentityResolverEventProcessor` is the only implemented processor.
`FDReductionEventProcessor` is an empty stub — a placeholder for file-descriptor
reduction that has not been written.

Processors may also implement `IAgentLifecycleNotification` to be told when an
agent's `boot_id` advances. The identity resolver uses this to destroy every
`UntilPowerOff` identity for that agent: sockets, handles and similar objects
whose identity cannot outlive a reboot.

### Identity resolution

For each event, `IdentityResolverEventProcessor` resolves the source and
destination objects to UUIDs and writes them into `persistent_identifier`.
Resolution honours `identity_op` (unify, create, destroy) and `identity_scope` —
see the [data model]({{ '/architecture/data-model/#identity-resolution' | relative_url }}).

Two optional enrichments:

- **`EnrichProcessedObjectProperties`** merges previously-seen properties of a
  matched identity into the outgoing event, so a bare `PID` reference carries the
  process's name and command line.
- **`RememberNonIdentifyingProperties`** keeps non-identifying properties in
  stored identity state.

Both default to `false` in the shipped config: each trades memory and message
size for coverage.

### Identity stores

| Implementation | Behaviour |
| --- | --- |
| `InMemoryIdentityStore` | All state in process memory. LRU eviction bounded by `IdentityRetention` (default 7 days), swept every `IdentityEvictionInterval`, with a hard cap at `MaxTrackedIdentities` (default 2 000 000) |
| `ChangelogWritingIdentityStore` | Decorates the above, mirroring every mutation to `IdentityChangelog`. The default configuration |
| `GarnetIdentityStore` | Legacy. Embedded Garnet (Redis protocol) via `GarnetServerManager`, or an external server via `GarnetConnectionString`. Persists without a changelog, at one network round trip per operation |

Supporting types: `IdentityIndexKeys` (index key construction),
`TrackedIdentityState` (the in-memory shape), `PropertyStateMapper` and
`PropertyValueFormatter` (property-to-index-key conversion).

### Changelog restore

`KafkaIdentityChangelog` writes entries to the compacted,
`RawEvents`-co-partitioned `IdentityChangelog` topic and replays them at startup
and on partition assignment.

{: .rationale }
> Because the topic is co-partitioned, a node restores exactly the identities
> belonging to the raw partitions it owns, so the identity state after a
> rebalance matches the events the node is about to process.

Restore progress is logged every `RestoreProgressInterval`.

{: .warning }
> `SkipIdentityRestore: true` starts processing immediately with empty state. The
> cost is that every still-live object is given a new UUID, splitting its history
> at the restart.

### Configuration

Full option documentation is in
`ProvCollector.EventProcessor/Configuration/EventProcessorOptions.cs`. The
settings that matter most in practice:

| Setting | Default | Effect |
| --- | --- | --- |
| `BufferLimit` | 5000 | Per-agent reorder buffer depth. Higher tolerates more ETW skew, costs memory and latency |
| `FlushTimeout` | 30 s | Idle flush for a quiet agent |
| `WorkerThreads` | 0 (= CPU count) | Parallelism |
| `IdentityStore` | `InMemory` | Store selection |
| `IdentityRetention` | 7 days | Identity lifetime. **Must match** `Writer:NodeCarryForwardWindow` |
| `MaxTrackedIdentities` | 2 000 000 | Memory ceiling. 0 disables the cap |
| `EnableIdentityChangelog` | true | Durability across restarts |
| `OffsetCommitInterval` | 5 s | Commit frequency, not commit lag |

### Tests

`Tests/ProvCollector.EventProcessor/` covers the pipeline (`EventProcessorTests`),
the store implementations (`IdentityStoreTests`) and changelog round-tripping
(`ChangelogTests`).

## ProvCollector.Database.Postgres.Writer

Consumes `ProcessedEvents` and bulk-inserts into PostgreSQL.

`PostgresWriterService` batches consumed events; `PostgresWriter` converts them
to `Node` and `Edge` rows and writes them with `EFCore.BulkExtensions` in chunks
of 2 000. Type GUIDs are interned to integers through `guid_lookups`.

### Day partitions

Both tables are `PARTITION BY LIST (agent_id)` with a child partition per agent
per day, created on demand. A `ConcurrentDictionary<(agentId, day)>` remembers
which partitions this process has already ensured, so the DDL check is not
repeated per batch.

### Node carry-forward

Node lookups are scoped per `(agent, day)` so each one prunes to a single
partition — measured on the live database, that plans 1 partition where the
previous batch-wide filter planned 25.

The consequence is that a node recurring across a day boundary has no row in the
new partition, so the writer seeds it from its most recent row within
`NodeCarryForwardWindow`. Without that seeding a new day's row would start from
only what that day's events happened to carry — frequently just `PID`, since most
event sources build the actor object with nothing else — and process-metadata
coverage metrics would fall as an artifact of storage rather than collection.

{: .invariant }
> `NodeCarryForwardWindow` **must match** `EventProcessor:IdentityRetention`. The
> bound is exact: an identity absent for longer than the retention window has been
> expired and reassigned a fresh UUID, so no earlier row belongs to it.

Nodes are keyed rather than appended within a partition group, so the same id
appearing twice in one batch produces one row and lands in exactly one of the
insert and update lists.
