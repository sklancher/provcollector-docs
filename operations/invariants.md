---
title: Operational invariants
parent: Operations
nav_order: 5
permalink: /operations/invariants/
---

# Operational invariants

Settings that must agree across services. In each case a mismatch does not stop
the system; it continues to run and produces a graph that is incorrect in a way
no error message reports.
{: .pc-lead }

## Carry-forward window equals identity retention

{: .invariant }
> `Writer:NodeCarryForwardWindow` **must equal** `EventProcessor:IdentityRetention`.

Node rows are scoped to a day partition and seeded from the previous row within
this window. An identity older than the retention window has already been expired
and reassigned a fresh UUID, so:

- A **longer** window carries nothing — there is no older row belonging to that
  identity, by construction.
- A **shorter** window loses process metadata, and makes coverage metrics fall
  for storage reasons rather than collection ones. A process node in the new day's
  partition starts from only what that day's events happened to carry, which is
  frequently just `PID`.

The second case is harder to diagnose, because the symptom is a rise in the
data-quality counters of the BotReporter's daily report, which suggests a
collection fault rather than a storage one.

## Changelog partitions equal RawEvents partitions

{: .invariant }
> `IdentityChangelog` partition count **must equal** `RawEvents` partition count.

Changelog entries are produced to the partition of the event that caused them. If
the counts differ, a restoring node reads the wrong slice of the log and rebuilds
an identity state that belongs partly to agents it does not own — and omits part
of the state for agents it does.

Both default to 10, created by `redpanda-init`. Changing one means changing both.

## MaxTrackedIdentities bounds memory

{: .invariant }
> `EventProcessor:MaxTrackedIdentities` bounds memory. Setting it to **0 disables
> the cap** and risks unbounded growth.

The default is 2 000 000. `InMemoryIdentityStore` evicts by LRU against
`IdentityRetention`, swept every `IdentityEvictionInterval`; the hard cap is the
backstop for a fleet that produces identities faster than retention expires them.

## SkipIdentityRestore splits history

{: .invariant }
> `EventProcessor:SkipIdentityRestore: true` starts processing immediately but
> gives every still-live object a fresh UUID, splitting its history at the
> restart.

The setting exists to restart a processor that cannot complete a restore. The
graph produced from that point is internally consistent and disconnected from
everything preceding it, so a backward traversal terminates at the restart
boundary.

## Quick audit

| Check | Where | Expected |
| --- | --- | --- |
| `Writer:NodeCarryForwardWindow` | Writer config | Equal to identity retention |
| `EventProcessor:IdentityRetention` | Processor config | Equal to carry-forward window (default 7 days) |
| `IdentityChangelog` partitions | Broker | Equal to `RawEvents` (default 10) |
| `EventProcessor:MaxTrackedIdentities` | Processor config | Non-zero (default 2 000 000) |
| `EventProcessor:EnableIdentityChangelog` | Processor config | `true` in any deployment you expect to restart |
| `EventProcessor:SkipIdentityRestore` | Processor config | `false` in normal operation |
| `AgentApiKeyHashes` | FleetServer config | Non-empty, or every agent is refused |
| `AllowInvalidCertificates` | Updater config | `false` outside development |

## Related failure modes

These are not cross-service agreements, but they degrade the graph without
reporting an error.

**The agent's bounded channel discards the newest events when full**
(`Kafka:EventBufferCapacity`, default 10 000, `DropWrite`). Under a broker outage
or a burst of activity the graph acquires gaps; see
[the pipeline]({{ '/architecture/pipeline/#the-bounded-channel' | relative_url }})
for the reasoning. An absence of events from a host is indistinguishable from an
idle host unless the discard counters are consulted.

**Event topic retention is one day.** The topics provide a replay window rather
than an archive, and a processor more than a day behind has lost events
permanently.

**`EnrichProcessedObjectProperties` and `RememberNonIdentifyingProperties` both
default to `false`.** Enabling them improves coverage at the cost of memory and
message size; with them disabled, an event carrying only a `PID` produces a node
with only a `PID`.
