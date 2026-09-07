---
title: Components
nav_order: 4
has_children: true
permalink: /components/
---

# Components
{: .no_toc }

Five repositories, pinned as submodules of the superproject. Each documents
itself; this section says what is in each one and how the pieces relate.
{: .pc-lead }

<ul class="pc-cards" markdown="0">
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/common/' | relative_url }}">ProvCollector.Common</a></p>
    <p>Four shared libraries: the wire contract and Kafka transport, the EF Core model, host plumbing, and the graph engine.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/agent/' | relative_url }}">ProvCollector.Agent</a></p>
    <p>The collection endpoint. Windows ETW sources, a Rust registry driver, and a Linux host skeleton.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/backend/' | relative_url }}">ProvCollector.Backend</a></p>
    <p>The two services between the agents and the database: event processor and PostgreSQL writer.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/analysis/' | relative_url }}">ProvCollector.Analysis</a></p>
    <p>Read-side tooling: the Tracker CLI, the Visualizer, the ThroughputMonitor and the BotReporter.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/management/' | relative_url }}">ProvCollector.Management</a></p>
    <p>The fleet plane: updater, fleet server, operator dashboard, and the Windows and Linux installers.</p>
  </li>
</ul>

## How they depend on each other

`ProvCollector.Common` is the only repository consumed as **packages** rather
than project references. Every other repository restores
`ProvCollector.Common.*` from the Nexus feed and references the packages through
a single `$(ProvCollectorCommonVersion)` property in its
`Directory.Build.props`.

| Repository | Consumes | Produces |
| --- | --- | --- |
| `ProvCollector.Common` | — | Four NuGet packages |
| `ProvCollector.Agent` | Common | Agent binaries, the registry driver |
| `ProvCollector.Backend` | Common | EventProcessor, Postgres writer |
| `ProvCollector.Analysis` | Common | Tracker, Visualizer, ThroughputMonitor, BotReporter |
| `ProvCollector.Management` | Common, Agent (nested submodule) | Updater, FleetServer, Dashboard, installers |

{: .note }
> The checkout under `ProvCollector.Common/` is the single editable copy, but
> edits there reach the other repositories only once Common is packed, published
> to Nexus, and each consumer's `$(ProvCollectorCommonVersion)` is bumped. A
> local `dotnet build` of the whole solution will not pick up an uncommitted
> Common change in a consumer project.

`ProvCollector.Management` carries `ProvCollector.Agent` as a **nested**
submodule under `submodules/`, because the installers must package agent
binaries. That is why cloning needs `--recurse-submodules` rather than a single
level of `--init`.

## Project naming

Within each repository, every project sits directly at the repository root —
there is no `Tools/` grouping layer. A project's directory name is its assembly
name, and its path is predictable from either.

## Targets

Every C# project targets `net10.0`, except `ProvCollector.Agent.Windows`, which
targets `net10.0-windows`. The registry driver is Rust against the WDK; the Linux
installers are Rust; the Windows installers are WiX v6.
