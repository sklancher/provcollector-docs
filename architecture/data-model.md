---
title: Data model
parent: Architecture
nav_order: 2
permalink: /architecture/data-model/
---

# Data model
{: .no_toc }

The wire contract, the identity rules built on top of it, and the schema it lands
in.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Telemetry and state throughout the pipeline use Protocol Buffers. Both Kafka
event topics carry the same `ProvenanceEvent` message contract; the difference
is that `RawEvents` contains transient system descriptors, whereas
`ProcessedEvents` has `persistent_identifier` resolved.

## ProvenanceEvent

| Field | Type | Description |
| --- | --- | --- |
| `event_type` | `Uuid` | Identifier indicating the operation type (e.g. process fork, file read) |
| `timestamp` | `uint64` | Wall-clock time (UTC, .NET ticks) for human queries and time windows |
| `source` | `ProvenanceObject` | The acting entity, usually a process |
| `destination` | `ProvenanceObject` | The acted-upon entity (file, socket, registry key) |
| `properties` | `map<string, PropertyData>` | Event-scoped metadata (thread ID, I/O flags, exit code) |
| `agent_id` | `Uuid` | Identifier of the reporting monitored host |
| `agent_monotonic_time` | `uint64` | Monotonic clock reading used for pipeline reordering |
| `boot_id` | `uint32` | Monotonically increasing host boot counter |
| `event_id` | `Uuid` | Unique identifier per event |

{: .rationale }
> Host wall-clock time can jump backwards or forwards under NTP synchronisation
> or manual adjustments, which would corrupt sequential reordering. Keeping a
> distinct monotonic timestamp ensures pipeline ordering is immune to wall-clock
> skew.

`boot_id` allows the backend to detect host reboots without explicit notification.
When an event arrives with a `boot_id` higher than previously seen for that host,
the pipeline expires all ephemeral, boot-scoped identities associated with the
agent.

A `ProvenanceObject` represents an entity, carrying its own property map, an
`object_type`, the assigned `persistent_identifier`, and the operation and scope
enums controlling resolution.

## PropertyData

Properties are strongly typed values (`string`, `sint64`, `uint64`, `bool`,
`double`, or `bytes`) paired with two fields governing identity matching:

- **`identifier_priority`**: Evaluation precedence (lower values evaluated first).
- **`identifier_behavior`**: Matching constraint:

| Behaviour | Meaning |
| --- | --- |
| `NONIDENTIFIER` | Informational data only. Ignored during identity resolution |
| `REQUIRED` | Must be present and match at this priority, or the object is considered distinct |
| `OPTIONAL` | Ignored when absent; behaves as `REQUIRED` when present |
| `OPTIONAL_NONAUTHORITATIVE` | A mismatch eliminates this priority tier, allowing fallback to lower priorities |

A process illustrates the need for priorities: a `PID` alone is weak evidence
(reused over time), while a `PID` combined with a process creation timestamp is
authoritative. Priorities allow the resolver to use strong criteria when
available while falling back to weaker identifiers when necessary.

{% include figures/identity.html %}

## Identity resolution

Two enums specify how an object's identity is resolved and managed:

### Operations (`identity_op`)

| Operation | Behaviour |
| --- | --- |
| `UNIFY` (default) | Match an active identity if criteria align, otherwise register a new one |
| `CREATE` | Force registration of a new identity, terminating any prior matching state |
| `DESTROY` | End the identity lifecycle (e.g. process termination, file deletion) |

### Scopes (`identity_scope`)

| Scope | Lifetime |
| --- | --- |
| `PERSISTENT` | Persists until an explicit `DESTROY`. A subsequent object with identical attributes is treated as a new entity |
| `UNTIL_POWER_OFF` | Persists until explicitly destroyed or until the host reboots (`boot_id` advance) |
| `TRACK_RELATED_OBJECT` | Bound to the lifecycle of the related object in the event (e.g. socket bound to its owning process) |

## Entity and event types

Standard object types include:

- `Process`
- `File`
- `Dns`
- `RegistryKey`
- `RegistryValue`
- `Ip`
- `Account`

Operations between entities are defined by specific event types. See the full
[event type reference]({{ '/reference/event-types/' | relative_url }}) for
all supported operations.

## Identity changelog

Active identity state is made durable via the compacted `IdentityChangelog`
Kafka topic, co-partitioned with `RawEvents`. Because partitions align with
`RawEvents`, state operations for an agent land on the exact partition carrying
that agent's events.

Changelog records use structured keys:

```
id:{agent_uuid}:{identity_uuid}   -> TrackedIdentity
boot:{agent_uuid}                 -> AgentBoot
```

A tombstone record (null value) represents identity destruction or eviction.
When an event processor starts or reassignment occurs, it replays the changelog
partitions it owns to reconstruct active in-memory state.

## Storage schema

Events are stored in PostgreSQL as two fact tables, both partitioned by list on
`agent_id` with daily child partitions created on demand:

```sql
CREATE TABLE nodes (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  agent_id       integer NOT NULL,
  timestamp      bigint  NOT NULL,
  properties     jsonb   NOT NULL,
  object_type_id integer NOT NULL,
  PRIMARY KEY (id, timestamp, agent_id)
) PARTITION BY LIST (agent_id);

CREATE TABLE edges (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  event_id       integer NOT NULL,
  timestamp      bigint  NOT NULL,
  source_id      uuid    NOT NULL,
  destination_id uuid    NOT NULL,
  properties     jsonb   NOT NULL,
  agent_id       integer NOT NULL
) PARTITION BY LIST (agent_id);
```

- **`nodes`**: Stores one row per active entity per agent per day, containing the
  accumulated properties of the entity as `jsonb`.
- **`edges`**: Stores each observed operation, connecting `source_id` and
  `destination_id` node UUIDs. Operations referencing only a single entity (e.g.
  standalone status events) are represented as self-loops on that entity.
