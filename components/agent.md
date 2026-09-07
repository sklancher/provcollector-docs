---
title: ProvCollector.Agent
parent: Components
nav_order: 2
permalink: /components/agent/
---

# ProvCollector.Agent
{: .no_toc }

The collection endpoint. Turns OS telemetry into `ProvenanceEvent` messages and
produces them to the `RawEvents` topic.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

| Project | Target | Role |
| --- | --- | --- |
| `ProvCollector.Agent` | `net10.0` | Platform-agnostic host, config and streaming |
| `ProvCollector.Agent.Windows` | `net10.0-windows` | ETW collection — the shipping agent |
| `ProvCollector.Agent.Linux` | `net10.0` | Host skeleton; collection not yet implemented |
| `ProvCollector.Agent.Windows.Driver` | Rust / WDM | Registry callback driver, emits ETW |

## ProvCollector.Agent (shared)

The platform-agnostic half. Platform projects supply implementations of a small
set of interfaces and call `builder.AddAgentServices()`; everything else lives
here.

### TraceService

The `IHostedService` that runs the agent. On start it:

1. Resolves each name in `EventSource:EnabledSources` through
   `IEventSourceRegistry`.
2. Constructs the source via `ActivatorUtilities`.
3. Creates the bounded event channel.
4. Registers the sources with the platform trace provider.
5. Hands the channel reader to the `IEventSender`.

A source that fails to construct is logged and skipped, so a fault in one
telemetry stream does not stop the others.

The channel is bounded at `Kafka:EventBufferCapacity` (default 10 000) with
`BoundedChannelFullMode.DropWrite`.

{: .rationale }
> Blocking the producer would stall the ETW callback, at which point the kernel
> discards events from the whole session rather than from one agent. Discarding
> the newest events bounds the loss to what the agent can account for.

### Interfaces the platform must supply

`IPlatformTraceProvider` (session lifecycle), `IEventSourceRegistry` (name to
type), `IBootIdProvider`, `IHighResolutionTimestampProvider`, and `IStringStorage`
(persistent small values).

### AgentIdProvider

Reads or creates the host's agent UUID through `IStringStorage`. On Windows that
is `HKLM\SOFTWARE\ProvCollector\{Name}` (`RegistryStringStorage`, falling back to
`HKCU` when the machine hive is not writable); on Linux it is a file under the
config directory (`DiskStringStorage`), also written by the installer.

The id is a fresh random UUID rather than anything derived from the machine, so
it is stable across reinstalls only if the store survives them.

### TimeConverter

Maps the monotonic clock ETW timestamps use onto wall-clock ticks. It holds a
single atomically-swapped anchor point and extrapolates using the hardware
`Stopwatch` tick rate, re-anchoring every 60 seconds by spin-waiting for an OS
timer tick boundary.

Conversion is lock-free; the trade-off is that converted times can jump slightly
forward or backward at each re-anchor. This is why `agent_monotonic_time` is
carried alongside `timestamp`, and is what the processor orders on.

### Streaming

`EventSender` reads the channel and produces to `RawEvents`, keyed by agent id.
`ConsoleEventSender` is the debugging alternative, swapped in by changing one DI
registration.

## ProvCollector.Agent.Windows

The shipping agent. Runs as a Windows Service under `LocalSystem`, reading config
and writing logs under `C:\ProgramData\ProvCollector\Agent.Windows`.

### Event sources

Each source declares the ETW providers it needs as `TraceDefinition`s;
`WindowsTraceProvider` aggregates them into one real-time session and dispatches
parsed events back to subscribers.

| Config name | Provider | Notes |
| --- | --- | --- |
| `Process` | `Microsoft-Windows-Kernel-Process` | Keywords `PROCESS \| IMAGE`. Default |
| `Process` (alt) | NT Kernel Logger | Selected by `UseKernelLogger: true` |
| `FileIO` | `Microsoft-Windows-Kernel-File` | Create/open/read/write/delete/rename/close |
| `IP` | `Microsoft-Windows-Kernel-Network` | TCP and UDP, keyword `0x30` |
| `DNS` | `Microsoft-Windows-DNS-Client` | Query completions |
| `Registry` | `ProvCollector-Agent-Windows-Provider` | The custom driver. Default |
| `Registry` (alt) | `Microsoft-Windows-Kernel-Registry` | `UseProvCollectorDriver: false` |
| `Account` | Security event log | Not ETW — an `EventLogWatcher` query |

Parsers for each provider's manifest live under
`DataCollection/ETW/EventParsers/`.

### Two configurable trade-offs

**`ProcessSourceOptions.UseKernelLogger`** — the NT Kernel Logger retrieves
command lines more reliably, but cannot be started early enough to capture
process events during boot. The default of `false` favours coverage of early boot
over completeness of command lines.

**`RegistrySourceOptions.UseProvCollectorDriver`** —
`Microsoft-Windows-Kernel-Registry` reports registry operations with largely
incomplete key paths, because the kernel logs a handle rather than a resolved
path. The bundled driver resolves the path in its callback. The default is
`true`; setting it `false` removes the driver dependency and reduces path
fidelity.

### AccountEventSource

`AccountEventSource` does not consume ETW. It subscribes to the Security log with
an XPath query for event IDs 4624, 4625, 4648, 4720, 4722–4726 and 4741–4743,
covering logon success and failure, explicit-credential logon, and account and
computer object lifecycle.

### Supporting pieces

- **`AutoLogger`** / `AutoLoggerSettings` configure an ETW AutoLogger session so
  collection starts at boot, before the service itself is running. Each
  `TraceDefinition` carries an `AutoLoggerDoesntWork` flag for providers that
  cannot be enabled that way — currently `Microsoft-Windows-Kernel-Network` and
  the ProvCollector registry provider — which are attached to the live session
  instead.
- **`ProcessTracker`** (`IObjectTracker<int>`) caches PID-to-process metadata so
  a file or network event can name the acting process without a lookup per event.
  Every ETW source takes it as an optional dependency.
- **`ProcessHelper`** and **`FileHelper`** resolve command lines, image paths and
  volume GUIDs.
- **`DPApiCredentialsProtector`** decrypts SASL credentials from the config file
  at startup.
- **`EventSourceBase`** filters out events the agent itself generates, so
  collection does not observe its own I/O and feed back into the stream.

## ProvCollector.Agent.Linux

A placeholder implementation. It stands up the complete host — configuration,
Kafka producer, event channel and `TraceService` — with `NoOpEventSource`
registered for every well-known source name, which allows the installer, updater
and fleet-management path to be tested end to end before Linux telemetry
collection is implemented.

Real implementations are `LinuxBootIdProvider` (reads the kernel's boot id) and
`LinuxHighResolutionTimestampProvider`. Config lives at
`/etc/ProvCollector/Agent.Linux/Config`, with the file explicitly named
`Agent.yaml` to match what the Linux setup binary writes and what the updater's
`PushConfig` targets.

## ProvCollector.Agent.Windows.Driver

A WDM kernel driver in Rust (`wdk` / `wdk-sys` crates, `no_std`,
`panic = "abort"`), built with `cargo-make`.

It registers a `CmRegisterCallbackEx` registry callback at altitude 36000 and
emits an ETW event for each operation it observes — create, open, delete, rename,
flush, load/unload, query and set for both keys and values, and the security
variants. The provider GUID is `973e2f5e-f305-4f64-b975-3c88f4576a3b`, published
as `ProvCollector-Agent-Windows-Provider` and consumed by `RegistryEventSource`
in the managed agent.

{: .rationale }
> The driver exists to resolve complete registry paths. Within the callback it
> still holds the key object and can resolve the path; `SafeRegistryPath` performs
> that resolution and guards against the object being torn down mid-callback.
> `Microsoft-Windows-Kernel-Registry` has no equivalent point of access and
> reports handles.

`ProvCollectorAgentWindowsDriver.inx` is the INF template and
`ProvCollector-Agent-Windows-Provider.xml` the ETW manifest.

{: .warning }
> A driver must be signed to load on a production Windows host. Unsigned builds
> require test signing to be enabled on the target, which weakens the host's
> security posture; the driver is therefore optional.
