---
title: Configuration
parent: Operations
nav_order: 3
permalink: /operations/configuration/
---

# Configuration
{: .no_toc }

Every service in the system resolves configuration through the same precedence
chain.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Precedence

Every service resolves configuration through `HostingExtensions` in this order —
**later sources win**:

1. `Resources/Config/default.yaml`, embedded in the assembly. On first run it is
   copied to the on-disk config path if no file is there, so a fresh install has
   a documented starting point.
2. `{ConfigFolder}/{Name}.yaml`, reloaded on change.
3. `{ConfigFolder}/{Name}.{Environment}.yaml`.
4. User secrets — Development environment only.
5. Environment variables prefixed `PROVCOLLECTOR_`, with `__` separating nested
   keys.
6. Command-line arguments.

So a nested key like `Kafka:BootstrapServers` becomes:

```bash
PROVCOLLECTOR_KAFKA__BOOTSTRAPSERVERS=broker:19092
```

{: .note }
> `CreateConfiguredApplicationBuilder` starts from
> `Host.CreateEmptyApplicationBuilder` rather than the default builder, since the
> default logging and configuration providers are the ones this chain replaces.
> Inheriting them would produce two overlapping sets of rules.

## Paths

Default paths come from `PlatformConstants`:

| | Windows | Linux |
| --- | --- | --- |
| Config | `%LOCALAPPDATA%\ProvCollector\{Name}\Config` | `/etc/ProvCollector/{Name}/Config/` |
| Logs | `%LOCALAPPDATA%\ProvCollector\{Name}\Logs` | `/var/log/ProvCollector/{Name}` |

`{Name}` is the entry assembly name with the `ProvCollector` prefix stripped, so
`ProvCollector.EventProcessor` uses `.../EventProcessor/`.

### The installed agent is the exception

The installed Windows agent and updater use the machine-wide layout instead, set
explicitly in `Program.cs` and mirrored by `UpdaterPaths`:

```
C:\ProgramData\ProvCollector\Agent.Windows\Config
C:\ProgramData\ProvCollector\Agent.Windows\Logs
```

{: .rationale }
> `LocalApplicationData` for a `LocalSystem` service resolves to the systemprofile
> directory, which is not a location an operator would ordinarily inspect.

## Credential protection

Agent SASL credentials are stored encrypted in the config file and decrypted at
startup by a `PostConfigure<KafkaOptions>` hook:

- **Windows** — `DPApiCredentialsProtector` (DPAPI).
- **Linux** — `PlatformCredentialsProtector`.

`IsProtected` recognises the wrapped form, so a plaintext value in a development
config still works — you do not have to encrypt a value just to test locally.

## Pushing configuration to a host

The dashboard reads and writes agent configuration through the fleet API, which
routes it to the updater's `GetConfig` / `PushConfig` command handlers.
`PushConfig` writes the new YAML and restarts the affected service.

Because a pushed payload keys files by name and the dashboard does not always
know which platform it is talking to, `IsAgentConfigFileName` /
`IsUpdaterConfigFileName` accept several spellings and route each to the right
destination.

{: .warning }
> `UpdaterPaths` is the single source of truth for where those files land, and
> host startup, `GetConfig` and `PushConfig` all read it. A pushed config written
> to a path the services do not read produces the same observable result as a
> config that was never applied.

The fleet API reports config **staleness**, so the dashboard can distinguish "the
host has this config" from "the host has been sent this config".

## A minimal agent config

```yaml
Kafka:
  BootstrapServers: broker:19092
  SchemaRegistryUrl: https://broker:18081
  SaslUsername: agent
  SaslPassword: "..."             # encrypted at rest once installed
  EventBufferCapacity: 10000

EventSource:
  EnabledSources: [Process, FileIO, IP, DNS, Registry, Account]

Serilog:
  MinimumLevel: Information
```

## A minimal event processor config

```yaml
EventProcessor:
  Processors: [IdentityResolver]
  BufferLimit: 5000
  FlushTimeout: "00:00:30"
  WorkerThreads: 0                # 0 = Environment.ProcessorCount
  IdentityStore: InMemory
  EnableIdentityChangelog: true
  IdentityRetention: "7.00:00:00" # must equal Writer:NodeCarryForwardWindow
  MaxTrackedIdentities: 2000000
  OffsetCommitInterval: "00:00:05"
```

See [Settings reference]({{ '/reference/settings/' | relative_url }}) for the
full list and [Invariants]({{ '/operations/invariants/' | relative_url }}) for the
values that must agree across services.

## Logging

Serilog throughout, configured by `HostingExtensions.ConfigureAppLogging`. A
bootstrap logger is installed before configuration is read, so early failures
such as a malformed YAML file or a missing certificate are recorded rather than
lost to an unconfigured logger.

The updater additionally forwards its own log events to `FleetServer` over
SignalR (`SignalRSerilogSink`), which is what populates the dashboard's live log
view. `LogStore` on the server keeps bounded ring buffers behind the SSE streams:
`CommandLogRetention` (default 5 000) globally, `UpdaterLogRetentionPerAgent`
(default 2 000) per agent.
