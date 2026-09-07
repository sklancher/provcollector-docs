---
title: Architecture
nav_order: 3
has_children: true
permalink: /architecture/
---

# Architecture
{: .no_toc }

How an OS event becomes a row in a provenance graph, and why each stage between
the two exists.
{: .pc-lead }

{% include figures/architecture.html %}

## Two planes

Two independent planes share the monitored host and nothing else.

**The data plane** carries provenance. It is one-way and asynchronous: agent to
Kafka, to the processor, back to Kafka, to the writer, into PostgreSQL.

**The management plane** carries fleet control. The `Updater` runs as a second
service beside the agent and holds a SignalR connection to `FleetServer`;
operators drive it through `AgentDashboard`. No functionality in the management
plane is required to collect or analyze provenance data.

{% include figures/management.html %}

Keeping them apart means an operator with dashboard access cannot read collected
provenance, and a compromised collection path cannot issue installer
instructions. [Security model]({{ '/architecture/security/' | relative_url }})
covers the boundary in detail.

## The data pipeline

| # | Stage | Component | What it does |
| --- | --- | --- | --- |
| 1 | Collection | `ProvCollector.Agent` | OS telemetry → `ProvenanceEvent` → `RawEvents` |
| 2 | Ordering | `ProvCollector.EventProcessor` | Per-agent event reordering |
| 3 | Identity resolution | `ProvCollector.EventProcessor` | Transient descriptors → stable UUIDs |
| 4 | Data reduction | `ProvCollector.EventProcessor` | Drop/merge redundant events |
| 5 | Storage | `Database.Postgres.Writer` | `ProcessedEvents` → `nodes` / `edges` tables |
| 6 | Analysis | `Tracker`, `Visualizer`, `BotReporter` | Graph traversal, visualization, etc. |

Each stage is modular: collection sources are pluggable, data reduction strategies can be customized, and the database writer can be replaced with alternative graph stores.

[The pipeline]({{ '/architecture/pipeline/' | relative_url }}) explains each stage in further detail.

## In this section

<ul class="pc-cards" markdown="0">
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/architecture/pipeline/' | relative_url }}">The pipeline</a></p>
    <p>Each of the six stages, what it guarantees, and the failure it is defending against.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/architecture/data-model/' | relative_url }}">Data model</a></p>
    <p>The protobuf wire contract, the identity resolution rules, the changelog, and the storage schema.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/architecture/security/' | relative_url }}">Security model</a></p>
    <p>The boundary between the planes, the per-role Kafka ACLs, and credential handling at rest and in flight.</p>
  </li>
</ul>
