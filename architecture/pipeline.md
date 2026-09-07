---
title: The pipeline
parent: Architecture
nav_order: 1
permalink: /architecture/pipeline/
---

# The pipeline
{: .no_toc }

How raw operating system events become an ordered, deduplicated, and queryable
provenance graph across six modular stages.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Stage 1 — Collection

Monitored hosts run an agent that captures OS telemetry and normalises it into
standard `ProvenanceEvent` records sent to the `RawEvents` Kafka topic.

Telemetry collection is **modular**: event providers for processes, file I/O,
network sockets, DNS, and registry can be selectively enabled, configured, or
extended with custom collection sources without altering downstream stages.

### Bounded buffering

The agent buffers outbound events in memory using a bounded channel. When the
buffer fills under network backpressure, the agent drops the *newest* events
rather than blocking the capture thread.

{: .rationale }
> Blocking kernel event tracing causes the kernel to silently discard events
> from the entire session. In contrast, drops inside the agent's bounded channel
> are observable, counted, and reported in data-quality metrics.

### Keying and monotonic time

Events are partitioned in Kafka by agent ID to ensure partition locality: all
events from a host are consumed sequentially on a single partition.

Events record both a UTC wall-clock `timestamp` (for queries) and an
`agent_monotonic_time` reading. The pipeline orders strictly on monotonic time,
insulating event sequencing from NTP clock adjustments.

## Stage 2 — Ordering

Operating systems constantly recycle transient identifiers like PIDs, file
descriptors, and port numbers. The primary purpose of ordering is to guarantee
accurate identity resolution when keys are reused—ensuring, for example, that a
process exit event is processed before a subsequent process creation reusing the
same PID.

The event processor consumes `RawEvents` into a per-agent priority queue sorted
by `agent_monotonic_time`, with consumption sharded by agent ID across worker
threads. Events are buffered until a batch threshold or flush timeout is reached,
and Kafka offsets are only committed once events make it all the way through the
processor to prevent data loss on crashes (accepting the risk of duplicate
processing upon recovery).

## Stage 3 — Identity resolution

Operating systems identify entities using transient descriptors that change over
time. Identity resolution translates these descriptors into persistent, globally
unique UUIDs (`persistent_identifier`).

Objects carry properties with priority and behavior rules (required, optional,
non-authoritative). The resolver matches incoming objects against active tracked
identities:

- **`UNIFY`**: Matches an existing identity if criteria align; otherwise registers
  a new identity.
- **`CREATE`**: Forces allocation of a new UUID, terminating any prior matching
  state (e.g. process start reusing a PID).
- **`DESTROY`**: Ends the lifecycle of an identity (e.g. process exit, file
  deletion).

### Scopes and reboot handling

Identities declare lifespans:

- **`PERSISTENT`**: Survives until explicitly destroyed.
- **`UNTIL_POWER_OFF`**: Ephemeral resources (sockets, handles) that expire
  automatically when an event's `boot_id` increments following a host reboot.
- **`TRACK_RELATED_OBJECT`**: Tied to a parent identity's lifetime (e.g. a
  socket owned by a process).

Active identity state is mirrored to the compacted `IdentityChangelog` Kafka topic
so nodes can rebuild in-memory state on restart or partition reassignment.

## Stage 4 — Data reduction

High-volume telemetry streams often generate millions of repetitive operations
(e.g. tight loops of small file reads or socket polling). The data reduction
stage merges and deduplicates redundant events to bound graph growth while
preserving causal fidelity.

Data reduction is **modular**: reduction strategies, filters, and aggregators can
be plugged into the pipeline or customised for specific deployment workloads.

## Stage 5 — Storage

Processed events are published to `ProcessedEvents` and ingested into the graph
store.

The storage layer is **modular and replaceable**: while the default stack uses
PostgreSQL for partitioned graph storage, the writer is an independent consumer
of `ProcessedEvents`. It can be replaced or paired with alternative sinks feeding
graph databases (e.g. Neo4j), vector stores, or streaming analytics platforms.

### Partitioned tables

The PostgreSQL writer stores data in two tables partitioned by list on
`agent_id` with daily child partitions created on demand:

- **`nodes`**: System entities and their merged properties (`jsonb`).
- **`edges`**: Directed operations between entity UUIDs.

### Node carry-forward

When a day boundary rolls over, active entities are seeded into the new day's
partition from their prior state. This ensures partition-pruned daily queries
retain complete entity metadata without having to query historical partitions.

{: .invariant }
> The node carry-forward window must match the identity retention duration to
> ensure active metadata is preserved without resurrecting expired identities.

## Stage 6 — Analysis

Analysis tools query the provenance graph to run time-respecting traversals:

- **Forward tracking** (impact analysis): Follows edges occurring at or after the
  timestamp at which the source node was executed or compromised.
- **Backward tracking** (root-cause analysis): Follows edges occurring at or
  before the timestamp of the observed symptom.

{: .rationale }
> An unconstrained graph traversal ignores event timing, introducing false
> causal links. If process A writes file F at 09:00 and process B reads file F at
> 08:00, a naive traversal connects A to B through F even though no data could
> have flowed backwards in time.

Traversals enforce node limits, edge bounds, and timestamp filters to keep
queries predictable over dense graphs.
