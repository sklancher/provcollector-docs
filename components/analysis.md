---
title: ProvCollector.Analysis
parent: Components
nav_order: 4
permalink: /components/analysis/
---

# ProvCollector.Analysis
{: .no_toc }

Read-side tooling. Four tools consume the provenance database or the Kafka
stream; none writes to `nodes` or `edges`.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

| Tool | Kind | Reads |
| --- | --- | --- |
| `ProvCollector.Tracker` | CLI | PostgreSQL |
| `ProvCollector.Visualizer` | Blazor Server | PostgreSQL (+ its own state DB) |
| `ProvCollector.ThroughputMonitor` | ASP.NET Core + SignalR | Kafka |
| `ProvCollector.BotReporter` | Worker service | PostgreSQL, Redpanda data dir |

## ProvCollector.Tracker

A batch provenance-tracking CLI. Given a CSV of seed objects it runs a
time-respecting traversal per seed and writes each result as a
NetworkX-compatible JSON graph.

```bash
ProvCollector.Tracker --csv seeds.csv --direction Backward --algorithm BFS \
    --output-dir Output --node-limit 50000
```

Seeds are `id,label` pairs; `--csv -` reads stdin. `SeedParser` handles parsing,
and `TraversalExecutor` runs traversals with bounded concurrency over
`ProvenanceTracker.Track`.

Every option has a config-file equivalent under the `Tracker` section, with the
command line taking precedence — the same layering every service uses. The full
option table is in the
[Tracker CLI reference]({{ '/reference/tracker-cli/' | relative_url }}).

{: .warning }
> A backward traversal from a frequently accessed file can reach most of the
> database. `--node-limit` and the timestamp bounds are what keep such a query
> finite, and should be treated as required in practice.

## ProvCollector.Visualizer

An interactive Blazor Server graph explorer. Search the database for seed
objects, run traversals, and render the result in the browser.

Rendering uses a JS interop bridge (`wwwroot/js/graphBridge.min.js`) over a WebGL
graph renderer, with a force layout by default (`Visualizer:SelectedLayout`,
`NodeSize`, `EdgeSize`). The UI offers per-property label selection, numeric
property colour scales, degree-based node sizing, a label render threshold, dark
mode, and per-node overrides.

Traversal runs against `PostgresGraph`; results are materialised into an
`InMemoryGraph` for interaction, so panning and filtering do not re-query.

{: .note }
> The SignalR message size cap is raised to 1 GB, because a materialised subgraph
> is transferred to the browser in one payload.

### Saved states

Optional. When `VisualizerDb:Host` is set, `DbVisualizerStorageService` persists
named graph states (`VisualizerState`: graph JSON, view config, node positions)
and tracking requests to a **second** PostgreSQL database, created on startup
with `EnsureCreated`.

With no host configured, `DisabledVisualizerStorageService` is registered
instead and the feature is unavailable; the tool runs read-only against the
provenance database.

{: .warning }
> The two config sections address different databases: `Postgres` is the
> provenance database and `VisualizerDb` is the visualizer's own state store.
> Pointing both at the same database is unsupported.

## ProvCollector.ThroughputMonitor

A live view of Kafka throughput. `KafkaConsumerService` consumes the selected
topic (default `RawEvents`), `ThroughputMetricsRegistry` aggregates rates, and
`ThroughputHub` broadcasts them over SignalR to a Razor Pages UI.

`TopicStateCoordinator` lets the UI switch topics at runtime: the consumer loop
runs under a token linked to both application shutdown and a topic-change signal,
so switching cancels and restarts the consumer rather than requiring a restart of
the service.

`FleetServer` connects to this hub as an upstream
(`ThroughputUpstreamService`) and folds the per-agent rates into the fleet
dashboard, so the same metrics appear there without every operator's browser
opening its own connection.

## ProvCollector.BotReporter

A scheduled reporting service that posts fleet health summaries to Slack.

### Scheduling

Period-based rather than interval-based: `ReportPeriod` (default 1 day) with
`PeriodStartTime` (default 05:00 UTC, which is US Central midnight) and
`ReportOffset` (default +06:00, so the daily report runs at 06:00 UTC after the
period closes). `RunOnce: true` generates a single report and exits, which is how
it is invoked ad hoc.

### Metrics

`EventStatistics` are collected per period and per agent:

- Node and edge counts, broken down by object type and event type.
- Active agent count.
- Disk used by the database and by the Redpanda data directory (mounted
  read-only into the container).
- Data-quality counters: files with missing names; processes with missing names,
  missing file paths, missing command lines, or no identifiers at all.

{: .rationale }
> The data-quality counters are the reason the tool exists. A process node with
> no identifying properties is a gap in the graph, and a rising count indicates
> that an event source has regressed. They provide the only automated means of
> distinguishing degraded collection from a period of low host activity.

`MetricHistoryStore` retains the previous period so every figure is reported with
an absolute and a percentage delta.

### Delivery

Prefers the Slack Web API (`BotToken` + `ChannelId`), which supports posting the
summary as blocks and then attaching the generated Excel workbook as a thread
reply via `files.getUploadURLExternal` / `files.completeUploadExternal`.

With only `WebhookUrl` configured it falls back to an incoming webhook, which
cannot carry file attachments. The workbook is still written to disk, and the log
records its path.

## Tests

`Tests/ProvCollector.Tracker.Common.Tests` is the substantial suite; see
[ProvCollector.Common]({{ '/components/common/#tests' | relative_url }}).
`Tests/ProvCollector.BotReporter.Tests` covers report period boundary
calculation.
