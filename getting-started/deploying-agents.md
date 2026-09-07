---
title: Deploying agents
parent: Getting started
nav_order: 3
permalink: /getting-started/deploying-agents/
---

# Deploying agents
{: .no_toc }

Building a configured installer, what it does on the target host, and how the
host stays current afterwards.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Building an installer

`ProvCollector.Management/Build-Installers.ps1` builds a configured agent
installer for either platform. It prompts for Kafka bootstrap servers, schema
registry URL, SASL credentials and a CA certificate path, injects them into the
platform's `default.yaml`, stages the certificate beside the setup project, and
builds.

```powershell
./ProvCollector.Management/Build-Installers.ps1 -Platform Windows `
    -BootstrapServers broker:9092 -SchemaRegistryUrl https://broker:8081 `
    -SaslUsername agent -SaslPassword '...' -CaCertPath ./ca.crt
```

Windows produces MSIs from the WiX v6 projects. Linux produces self-extracting
Rust setup binaries.

{: .note }
> The installer bakes in the connection settings so that a host needs no manual
> configuration to start reporting. Everything it writes can still be replaced
> later by pushing new configuration from the dashboard.

## What the Windows installer does

`ProvCollector.Agent.Windows.Setup` and `ProvCollector.Updater.Windows.Setup`
produce per-machine MSIs. Each one:

- Installs to `C:\Program Files\ProvCollector\{App}`.
- Registers a `LocalSystem` Windows Service with `Start=auto`.
- Writes YAML configuration into `C:\ProgramData\ProvCollector\Agent.Windows\Config`.


## Host configuration locations

| | Windows | Linux |
| --- | --- | --- |
| Agent config | `C:\ProgramData\ProvCollector\Agent.Windows\Config\Agent.Windows.yaml` | `/etc/ProvCollector/Agent.Linux/Config/Agent.yaml` |
| Updater config | same folder, `Agent.Windows.Updater.yaml` | `/etc/ProvCollector/Updater/Config/Agent.Updater.yaml` |
| Agent service | `ProvCollector.Agent.Windows` | `provcollector-agent` |
| Updater service | `ProvCollector.Updater` | `provcollector-updater` |
| Logs | `C:\ProgramData\ProvCollector\Agent.Windows\Logs` | `/var/log/ProvCollector/{Name}` |
| Agent ID | `HKLM\SOFTWARE\ProvCollector\Agent.Windows\AgentId` | `/etc/ProvCollector/Agent.Linux/PersistentData/AgentId` |


## Staying current

The **Updater** runs as a second service beside the agent and maintains a connection to the fleet backend.
In addition to performing updates for itself and the agent, the updater manages configuration delivery and reports agent liveness telemetry.

The updater checks for updates every `IntervalHours` (default 24), or on-demand when an update is requested from the fleet backend.


{: .warning }
> `AllowInvalidCertificates` disables TLS peer verification on the updater's hub
> connection, and is intended for development only. With it set, the channel over
> which the host receives installer instructions is unauthenticated.

