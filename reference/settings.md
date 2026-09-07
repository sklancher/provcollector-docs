---
title: Settings
parent: Reference
nav_order: 3
permalink: /reference/settings/
---

# Settings
{: .no_toc }

The settings across all services that most often need changing. Every one of them
resolves through the
[shared precedence chain]({{ '/operations/configuration/' | relative_url }}).
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Agent

| Setting | Default | Effect |
| --- | --- | --- |
| `Kafka:BootstrapServers` | — | Broker address reachable from the monitored host |
| `Kafka:SchemaRegistryUrl` | — | Schema registry endpoint |
| `Kafka:SaslUsername` / `SaslPassword` | — | SASL/SCRAM credentials; encrypted at rest once installed |
| `Kafka:EventBufferCapacity` | 10 000 | Bounded channel depth. Full → newest events dropped (`DropWrite`) |
| `EventSource:EnabledSources` | — | Source names to instantiate: `Process`, `FileIO`, `IP`, `DNS`, `Registry`, `Account` |
| `ProcessSourceOptions:UseKernelLogger` | `false` | NT Kernel Logger gives better command lines but cannot start early enough for boot coverage |
| `RegistrySourceOptions:UseProvCollectorDriver` | `true` | The bundled driver resolves full registry paths; the kernel provider reports handles |

## Event processor

| Setting | Default | Effect |
| --- | --- | --- |
| `Processors` | `[IdentityResolver]` | Processor chain by name. An unregistered name is a startup failure |
| `BufferLimit` | 5 000 | Per-agent reorder buffer depth. Higher tolerates more ETW skew, costs memory and latency |
| `FlushTimeout` | 30 s | Idle flush for a quiet agent |
| `WorkerThreads` | 0 (= CPU count) | Parallelism. One agent always maps to one worker |
| `IdentityStore` | `InMemory` | `InMemory` or legacy `Garnet` |
| `EnableIdentityChangelog` | `true` | Durability across restarts |
| `IdentityRetention` | 7 days | Identity lifetime. **Must equal** `Writer:NodeCarryForwardWindow` |
| `IdentityEvictionInterval` | — | LRU sweep frequency |
| `MaxTrackedIdentities` | 2 000 000 | Memory ceiling. **0 disables the cap** |
| `SkipIdentityRestore` | `false` | Start immediately with empty state; splits every live object's history |
| `RestoreProgressInterval` | — | How often restore progress is logged |
| `OffsetCommitInterval` | 5 s | Commit *frequency*, not commit lag |
| `EnrichProcessedObjectProperties` | `false` | Merge known properties of a matched identity into outgoing events |
| `RememberNonIdentifyingProperties` | `false` | Keep non-identifying properties in stored identity state |
| `GarnetConnectionString` | — | External Garnet server; embedded otherwise. Legacy path |

## Writer

| Setting | Default | Effect |
| --- | --- | --- |
| `NodeCarryForwardWindow` | 7 days | Seeds a node's row in a new day partition from its most recent earlier row. **Must equal** `EventProcessor:IdentityRetention` |
| `Postgres:*` | — | Host, port, database, credentials, SSL mode, CA certificate |

## Tracker

Every Tracker option has a config-file equivalent under the `Tracker` section —
see the [CLI reference]({{ '/reference/tracker-cli/' | relative_url }}) for the
full table. The ones with real cost:

| Setting | Default | Effect |
| --- | --- | --- |
| `NodeLimit` / `EdgeLimit` | — | Per-query traversal bounds. Effectively mandatory |
| `Concurrency` | 4 | Traversals in flight |
| `Prefetch` | 10 | Nodes fetched per batch within a traversal |
| `MinRealtimeTimestamp` / `MaxRealtimeTimestamp` | — | ISO-8601 UTC bounds. The cheapest way to make a query finite |

## Visualizer

| Setting | Default | Effect |
| --- | --- | --- |
| `Postgres:*` | — | The **provenance** database |
| `VisualizerDb:Host` | unset | The Visualizer's **own** state store. Unset disables saved states entirely |
| `Visualizer:SelectedLayout` | force | Graph layout |
| `Visualizer:NodeSize` / `EdgeSize` | — | Render sizing |

{: .warning }
> `Postgres` and `VisualizerDb` address different databases. Pointing both at the
> same database is unsupported.

## ThroughputMonitor

| Setting | Default | Effect |
| --- | --- | --- |
| Topic selection | `RawEvents` | Switchable at runtime through the UI via `TopicStateCoordinator` |

## BotReporter

| Setting | Default | Effect |
| --- | --- | --- |
| `ReportPeriod` | 1 day | Reporting period length |
| `PeriodStartTime` | 05:00 UTC | Period boundary (US Central midnight) |
| `ReportOffset` | +06:00 | Delay after the period closes before reporting |
| `RunOnce` | `false` | Generate one report and exit — how it is invoked ad hoc |
| `BotToken` + `ChannelId` | — | Slack Web API. Required for the Excel workbook attachment |
| `WebhookUrl` | — | Fallback. Cannot carry file attachments |

## FleetServer

| Setting | Default | Effect |
| --- | --- | --- |
| `AgentApiKeyHashes` | — | SHA-256 digests of accepted agent API keys. **Empty refuses every agent** |
| `CommandLogRetention` | 5 000 | Global command log ring buffer |
| `UpdaterLogRetentionPerAgent` | 2 000 | Per-agent log ring buffer |
| `UploadsFolder` | — | Where uploaded installer packages are stored |

## Updater

| Setting | Default | Effect |
| --- | --- | --- |
| `Url` | — | FleetServer base URL |
| `ApiKey` | — | Presented as `X-Api-Key` on the hub connection |
| `HeartbeatInterval` | 15 s | Heartbeat frequency |
| `IntervalHours` | 24 | Update check frequency |
| `Applications` | — | Which managed applications to keep current |
| `AllowInvalidCertificates` | `false` | Disables TLS peer verification. **Development only** |

## AgentDashboard

| Setting | Default | Effect |
| --- | --- | --- |
| `BackendUrl` | — | The fleet API. The dashboard holds no state of its own |

## See also

[Operational invariants]({{ '/operations/invariants/' | relative_url }}) — the
settings that must agree across services, and what breaks quietly when they do
not.
