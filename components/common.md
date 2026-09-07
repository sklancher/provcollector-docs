---
title: ProvCollector.Common
parent: Components
nav_order: 1
permalink: /components/common/
---

# ProvCollector.Common
{: .no_toc }

Four libraries shared by every other repository. They are the only components
consumed as NuGet packages rather than project references.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

All four target `net10.0`. Packaging metadata is shared through
`Directory.Build.props`: symbol packages are always produced, and
`GeneratePackageOnBuild` is off, so packing is an explicit CI step rather than a
side effect of a local build.

## ProvCollector.EventStream

The wire contract and the Kafka transport. Everything that crosses a process
boundary in the data plane is defined here.

**Protos** — `provenance_event`, `provenance_object`, `property_data`, `uuid`,
`identity_changelog`. Protobuf edition 2023, compiled at build time. The full
contract is in the [data model]({{ '/architecture/data-model/' | relative_url }}).

**Type registries** — `ProvenanceEvents.cs` and `ProvenanceObjects.cs` declare
the well-known event and object type GUIDs as annotated enums, with cached
bidirectional GUID lookups and display names. `ProvenanceObjects` also provides
typed factories (`Process`, `File`, `Ip`, `Dns`, `RegistryKey`, `RegistryValue`,
`Account`) that assemble an object's property map with the right
`IdentifierBehavior` and priority values, so an event source never hand-builds
one.

**Streaming** (`Streaming/`) — `IEventProducer` / `IEventConsumer` abstractions
over Confluent Kafka, implemented by `KafkaEventProducer` and
`KafkaEventConsumer`. `IPartitionAwareConsumer` exposes partition assignment and
revocation, which the event processor needs in order to know which slice of the
identity changelog to restore. `EventTopic` enumerates the three topics.

`NullTolerantProtobufSerdes` handles compacted-topic tombstones, where a record
has a key but no value; the stock Protobuf deserialiser throws on those.

**Properties** (`Properties/`) — the compaction machinery.
`PropertyKeyRegistry` and its SQL-backed variant map property names to numeric
ids, `Base36` shortens integer encodings, `InternedString` replaces repeated
strings with dictionary references, and `PropertyCompactor` applies all three on
the write path while tallying properties it could not encode as declared.

**Configuration** — `KafkaOptions` (bootstrap servers, SASL, compression,
batching, offsets, `EventBufferCapacity`) and `CertificateHelper`, which resolves
the CA certificate path for both Kafka and PostgreSQL connections.

## ProvCollector.Database.Postgres

The EF Core model for the provenance database.

`ProvDbContext` exposes `Nodes`, `Edges` and `GuidLookups`, builds its connection
string from `PostgresOptions` (host, port, database, credentials, SSL mode, CA
certificate), and applies `UseSnakeCaseNamingConvention()`. It throws a clear
error at configuration time rather than failing later if the `Postgres` section
is empty.

Both fact entities are `ExcludeFromMigrations`: the tables are
`PARTITION BY LIST (agent_id)` and their day partitions are created by raw SQL at
write time, which EF cannot express. The migration that creates the parent tables
is `20260625214247_AddPartitionedEdgesTable`.

`Node.NewNode` and `Edge.NewEdge` build rows from protobuf messages, interning
type GUIDs through a caller-supplied `Func<Guid, int>` and serialising properties
to `jsonb`. `Edge.NewEdge` folds a one-sided event, where either the source or the
destination is null, into a self-loop; it rejects only an event with neither
side.

Also here: `PostgresReader` / `IDatabaseReader` for read-side queries,
`GuidAssociator` for GUID-to-int interning, and `DatabaseStatsSnapshot`, which
backs the BotReporter's size and count metrics.

## ProvCollector.Utils

Cross-cutting host plumbing, containing no provenance concepts.

**`HostingExtensions`** is the entry point every service uses.
`CreateConfiguredApplicationBuilder` starts from
`Host.CreateEmptyApplicationBuilder` rather than the default builder, since the
default logging and configuration providers are the ones being replaced. It then
layers the [YAML/env/CLI configuration chain]({{ '/operations/configuration/' | relative_url }}),
installs Serilog with a bootstrap logger, and optionally wires Windows Service or
systemd integration.

**`PlatformConstants`** derives the per-platform config, log, data and upload
paths from the entry assembly name.

**`PlatformServiceController`** drives `systemctl` on Linux and `sc.exe` on
Windows. It compensates for two properties of `sc.exe`: it has no restart verb,
and `sc stop` returns when the SCM accepts the request rather than when the
service has stopped.

**`PlatformCredentialsProtector`** is the Linux side of at-rest credential
protection; DPAPI covers Windows, from inside the agent.

**`ConfigNormalizer`** and **`JsonExtensions`** handle config shape fixups and
JSON conversion.

## ProvCollector.Tracker.Common

A queryable graph abstraction over the provenance database, and the shared
engine behind the Tracker CLI, the Visualizer and the graph tests.

**Abstractions** (`Graph/Abstract/`) — `IGraph`, `IQueryableGraph`,
`IMutableGraph`, `IGraphNode`, `IGraphEdge`, `IGraphTraversal<TState>`,
`IGraphSearchKernel`, `EdgeDirection`, and LINQ-style extension methods. A
traversal is composed rather than hand-written: `Where` filters edges,
`ExpandWhere` prunes expansion after a node is popped, and `UpdateState` mutates
traversal state before pushing. `SearchKernels` supplies BFS and DFS.

**Backends** — `InMemoryGraph` (dictionary-backed, used by tests and for
materialised subgraphs) and `PostgresGraph`, which translates traversals into
SQL. `PostgresQueryTranslator`, `PostgresPredicateTranslator` and
`PropertyAccessTranslation` handle expression-to-SQL conversion, including `jsonb`
property access; `GuidLookupCache` caches the GUID-to-int interning so a
traversal does not re-query it per hop.

**Execution** (`Graph/Execution/`) — `GraphQueryEngine` and
`TranslationDecisionService` decide, per query, whether a predicate can be pushed
into SQL or must be evaluated client-side after materialisation.
`AsyncEnumerableQueryable` streams results so a large traversal does not have to
fit in memory.

**`ProvenanceTracker`** implements time-respecting traversal. Given a seed node,
a direction and a starting timestamp, a forward walk follows only edges at or
after the time the source node was reached, and a backward walk only edges at or
before it, updating each node's reached time as it goes. Node and edge limits
bound the search.

{: .rationale }
> An unconstrained traversal returns every node reachable in the graph, including
> those that no information could have reached. The timestamp constraint is what
> separates a provenance query from a reachability query.

## Tests

`Tests/ProvCollector.Tracker.Common.Tests` is the substantial suite. Graph
behaviour is written once in `Graph/Base/*TestsBase` — CRUD, traversal,
pathfinding, provenance semantics, relational queries, limits — and run against
both backends by the `InMemory/` and `Postgres/` subclasses, so the SQL
translator is held to the same contract as the reference implementation.

`Properties/` covers the compaction machinery: `Base36`, `InternedString`,
`PropertyCompactor`, `PropertyDocument`, `PropertyKeyRegistry` and its SQL
variant, property-access translation, and node scoping in the writer.
