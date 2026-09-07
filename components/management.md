---
title: ProvCollector.Management
parent: Components
nav_order: 5
permalink: /components/management/
---

# ProvCollector.Management
{: .no_toc }

The fleet management plane: getting the agent onto a host, keeping it configured,
and keeping it current.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Separate from the provenance data plane; no component here reads collected
events.

| Component | Kind | Runs on |
| --- | --- | --- |
| `ProvCollector.Updater` | Worker service | Every monitored host, beside the agent |
| `ProvCollector.FleetServer` | ASP.NET Core | The backend host |
| `ProvCollector.AgentDashboard` | Blazor Server | The backend host |
| `ProvCollector.Fleet.Contracts` | Library | Shared by server and dashboard |
| `Installers/Windows` | WiX v6 | Build machine → target host |
| `Installers/Linux` | Rust | Build machine → target host |

This repository carries `ProvCollector.Agent` as a nested submodule under
`submodules/`, because the installers must package agent binaries.

## ProvCollector.Updater

A second service installed alongside the agent. It owns everything the agent
itself does not: the connection to the fleet backend, config delivery, and
installing new versions of both the agent and itself.

**`HeartbeatWorker`** sends an `AgentHeartbeatPayload` over SignalR every
`HeartbeatInterval` seconds (default 15): hostname, OS, IP, uptime, CPU and
memory use, and the installed version and service state of each managed
application.

**`SignalRConnectionService`** maintains the hub connection to
`{Url}/api/v1/agent/connection?agentId={guid}`, presenting the configured API key
in an `X-Api-Key` header.

**`RemoteCommandDispatcher`** routes inbound `ExecuteCommand` invocations to
handlers by `CommandType`:

| Command | Handler | Effect |
| --- | --- | --- |
| `Ping` | `PingCommandHandler` | Liveness check |
| `GetConfig` | `GetConfigCommandHandler` | Returns the current agent and updater YAML |
| `PushConfig` | `PushConfigCommandHandler` | Writes new YAML and restarts the affected service |
| `TriggerUpdateCheck` | `TriggerUpdateCommandHandler` | Runs an update check immediately |

**`SignalRSerilogSink`** forwards the updater's own log events up the same
connection, which is what populates the dashboard's live log view.

**`UpdateWorker` / `UpdateService`** check for updates every `IntervalHours`
(default 24), or on demand. For each enabled application in `Applications`, the
service compares the installed file version against the packages the backend
advertises, downloads the newer one, **verifies its SHA-256 against the digest
from the API**, and only then stops the service, installs, and restarts.

{: .rationale }
> A package that fails verification is deleted rather than left in the temp
> directory, so a later run cannot pick it up as already checked. A missing
> digest causes the install to be refused.

{: .rationale }
> The download has no overall timeout. A single deadline covering an entire
> response body imposes a minimum bandwidth requirement: 30 seconds against the
> 47 MB Linux installer requires a sustained 12.5 Mbit/s. Connection setup remains
> bounded, and a stalled transfer is caught by a per-read idle timeout.

### UpdaterPaths

The single source of truth for where config and binaries live on each platform.
Every consumer — host startup, `GetConfig`, `PushConfig` — must agree, or a
pushed config lands somewhere the services never read.

| | Windows | Linux |
| --- | --- | --- |
| Agent config | `C:\ProgramData\ProvCollector\Agent.Windows\Config\Agent.Windows.yaml` | `/etc/ProvCollector/Agent.Linux/Config/Agent.yaml` |
| Updater config | same folder, `Agent.Windows.Updater.yaml` | `/etc/ProvCollector/Updater/Config/Agent.Updater.yaml` |
| Agent service | `ProvCollector.Agent.Windows` | `provcollector-agent` |
| Updater service | `ProvCollector.Updater` | `provcollector-updater` |

{: .rationale }
> `PlatformConstants.DataFolderPath` is not used on Windows. It resolves to
> per-user `LocalApplicationData`, which for a `LocalSystem` service is the
> systemprofile directory.

Because a pushed payload keys files by name and the dashboard does not always
know which platform it is talking to, `IsAgentConfigFileName` /
`IsUpdaterConfigFileName` accept several spellings and route each to the right
destination.

## ProvCollector.FleetServer

One process serving three API surfaces, separated by prefix so that
authorization applies per prefix and the operator API can change without touching
a contract deployed agents depend on:

| Prefix | Consumer | Stability |
| --- | --- | --- |
| `/api/v1/agent` | Updaters (SignalR hub at `/connection`) | **Frozen** — deployed agents depend on it |
| `/api/v1/updates` | CI and external tooling | Published contract |
| `/api/v1/fleet` | The dashboard | Free to change |

**`AgentHub`** authenticates on `OnConnectedAsync`, *before* registration: an
invalid or missing `X-Api-Key` aborts the connection rather than being ignored,
because a connection left open can still send heartbeats. `AgentApiKeyValidator`
compares SHA-256 digests with `FixedTimeEquals`.

{: .warning }
> With no `AgentApiKeyHashes` configured the server refuses every agent. An
> earlier version accepted the header without checking it, so an unconfigured
> deployment accepted any connection and recorded nothing to indicate it.

**Operator API** (`FleetEndpoints`) covers agents (list, detail, patch, delete,
tags, applications, telemetry), config (get with staleness reporting, put),
commands (issue, poll, list, SSE stream), logs (list and SSE stream), packages
(list, upload, delete), rollouts, and throughput settings. Every 4xx and 5xx is
`application/problem+json` (RFC 9457) with a machine-readable `code` from
`ProblemCodes`, so the frontend has one error shape rather than one per endpoint.

**`PackageManagementService`** stores uploaded installers under
`{UploadsFolder}/{Platform}/{AppName}/`, stamping the version into the filename.
It publishes a SHA-256 digest per package for the updater to verify against,
cached on the file's path, length and write time.

{: .rationale }
> The package list is rebuilt by scanning the uploads folder on every request,
> and re-hashing a 47 MB installer on each poll would dominate the response time.
> Download paths are checked to remain under the uploads root before the
> filesystem is touched.

**`ThroughputUpstreamService`** holds the single connection to the
ThroughputMonitor hub and folds per-agent EPS into agent rows. An earlier version
ran this in the browser, so every operator tab opened its own connection. One
upstream connection now serves every viewer, and the collector need only be
reachable from this host.

**`LogStore`** keeps bounded in-memory ring buffers behind the SSE streams:
`CommandLogRetention` (default 5 000) globally and `UpdaterLogRetentionPerAgent`
(default 2 000) per agent.

## ProvCollector.AgentDashboard

The operator UI. A Blazor Server app with **no state of its own** — every read
and write goes through the fleet API at `AgentDashboard:BackendUrl`, via
`FleetApiClient` and the typed `FleetApiAgentService` / `FleetApiPackageService`.
`FleetStreamClient` consumes the SSE endpoints for live command and log views.

Pages: `FleetOverview` (agent grid), `AgentDetail` (telemetry, config editor,
command issue), `UpdateManager` (package upload, rollouts), `ThroughputMonitor`
(embedded fleet-wide throughput), `AuditLogs`.

## ProvCollector.Fleet.Contracts

The shared vocabulary between server and dashboard, so the two cannot drift:
`ApiPrefixes` and `FleetRoutes` (route construction), `AgentNode` /
`AgentStatusEnum` / `AgentOsType`, `CommandStatuses`, `ProblemCodes`,
`PackageVersionTag`, the service interfaces, and the throughput contracts.

`AgentNode` illustrates the conventions the contract follows. `Uptime` is a
`TimeSpan` in process and serialises as `uptimeSeconds`, since `"00:07:31"` is a
poor representation for a public JSON contract. Tags are split into
operator-assigned (`AssignedTags`) and derived (the OS tag); the public `Tags`
setter discards derived entries rather than rejecting them, so a client can read
the list and write it back without distinguishing the entries it does not own.

## Installers

`Build-Installers.ps1` at the repository root drives both platforms — see
[Deploying agents]({{ '/getting-started/deploying-agents/' | relative_url }}) for
invocation.

### Windows (WiX v6)

`ProvCollector.Agent.Windows.Setup` and `ProvCollector.Updater.Windows.Setup`
produce per-machine MSIs. Each installs to
`C:\Program Files\ProvCollector\{App}`, registers a `LocalSystem` Windows Service
with `Start=auto`, and writes YAML config into
`C:\ProgramData\ProvCollector\Agent.Windows\Config`.

The installer UI collects Kafka settings and which event sources to enable; those
are handed to `Write-Config.ps1` as a deferred custom action. `read_config.vbs`
reads the existing YAML back before `AppSearch`, so a major upgrade repopulates
the dialogs from the installed configuration rather than resetting to defaults.
`browse_cert.vbs` is the CA certificate picker.

### Linux (Rust)

Self-extracting setup binaries that install the agent and updater, register
`provcollector-agent` and `provcollector-updater` systemd units, and write the
agent id and configuration under `/etc/ProvCollector/`.
