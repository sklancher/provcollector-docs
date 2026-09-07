---
title: Installation
parent: Getting started
nav_order: 1
permalink: /getting-started/installation/
---

# Installation
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Requirements

| Requirement | Notes |
| --- | --- |
| [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/10.0) | --- |
| [Docker Compose](https://docs.docker.com/compose/install/) | This is the easiest way to deploy ProvCollector; you can also deploy manually |
| [WiX Toolset](https://github.com/wixtoolset/wix/releases/) | Required to build the Windows MSI installers |
| [Rust](https://rust-lang.org/learn/get-started/) | Required to build the Windows driver and Linux installers |
| [`cargo-make`](https://sagiegurari.github.io/cargo-make/) | Required to build the Windows driver | 
| [Windows SDK & WDK](https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk) | Required to build the Windows driver | 
| [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) | Required for packaging dependencies in frontend projects |

{: .note }
> The `ProvCollector.Common` libraries are consumed as **NuGet packages**, not
> project references. For development, you will likely want to change this to 
> use project references instead.


## Clone the superproject

The five component repositories are git submodules of the superproject. Clone
them together:

```bash
git clone --recurse-submodules https://gitlab.syssec.org/prov-research/provcollector.git
cd provcollector
```

If you already cloned without them:

```bash
git submodule update --init --recursive
```


## Build

All ProvCollector subprojects can be built with a single command:

```bash
dotnet build ProvCollector.slnx -c Release
```

When building on a non-Windows host, add `-p:EnableWindowsTargeting=true` to **both** restore and build:

```bash
dotnet restore ProvCollector.slnx -p:EnableWindowsTargeting=true
dotnet build   ProvCollector.slnx -c Release -p:EnableWindowsTargeting=true
```

The driver can only be built from Windows with the WDK installed.

## Certificates

The Compose stack expects TLS material already present on the host. There is no
self-signed fallback: a missing file means the broker will not start.

```
/opt/ProvCollector/redpanda-certs/{ca.crt,redpanda.crt,redpanda.key}
/opt/ProvCollector/postgres-certs/{ca.crt,server.crt,server.key}
```

They are bind-mounted read-only into the broker, the Redpanda console and
PostgreSQL.

### Generating them

A single CA signs both server certificates. Redpanda's `truststore_file` and
PostgreSQL's `ca.crt` mount both point at it, so one root is enough for the
whole stack:

```bash
openssl req -x509 -new -nodes -newkey rsa:4096 -days 3650 \
  -subj "/CN=ProvCollector CA" \
  -keyout ca.key -out ca.crt
```

Redpanda's certificate needs a SAN for every name a client dials — the internal
Compose network name and `EXTERNAL_IP` from the [Environment](#environment)
table:

```bash
openssl req -new -nodes -newkey rsa:4096 \
  -subj "/CN=redpanda-0" \
  -addext "subjectAltName=DNS:redpanda-0,IP:${EXTERNAL_IP}" \
  -keyout redpanda.key -out redpanda.csr

openssl x509 -req -in redpanda.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 825 -copy_extensions copy \
  -out redpanda.crt
```

PostgreSQL only needs to be reachable from the other services on the Compose
network, so a SAN for the service name is enough:

```bash
openssl req -new -nodes -newkey rsa:4096 \
  -subj "/CN=postgres" \
  -addext "subjectAltName=DNS:postgres" \
  -keyout server.key -out server.csr

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 825 -copy_extensions copy \
  -out server.crt
```

Place the results as shown above — `ca.crt` is duplicated into both
directories, since each service is handed its own truststore rather than a
shared one — and restrict the two `.key` files to the account running Compose.

{: .warning }
> `-copy_extensions copy` is what carries the `subjectAltName` from the request
> into the signed certificate. Without it, modern TLS clients reject the
> certificate outright, since they no longer fall back to matching the CN
> against the hostname.

### Getting the CA certificate onto an agent

An agent only ever needs `ca.crt` — the certificate that identifies it to
Redpanda is the SASL username and password from the
[Environment](#environment) table, not a client certificate, so `redpanda.key`
and `server.key` never leave the backend host.

The straightforward path is to hand `ca.crt` to
[`Build-Installers.ps1`]({{ '/getting-started/deploying-agents/#building-an-installer' | relative_url }})
so it is baked into the installer:

```powershell
./ProvCollector.Management/Build-Installers.ps1 -Platform Windows `
    -BootstrapServers broker:9092 -SchemaRegistryUrl https://broker:8081 `
    -SaslUsername agent -SaslPassword '...' -CaCertPath ./ca.crt
```

The Linux setup binary takes the same certificate through `--kafka-ca` instead.

Without a baked-in installer, drop `ca.crt` directly into the agent's config
folder under the name `ca.crt` and it is picked up on startup with no
`Kafka.SslCaLocation` entry required:

| Platform | Path |
| --- | --- |
| Windows (installed agent) | `C:\ProgramData\ProvCollector\Agent.Windows\Config\ca.crt` |
| Linux | `/etc/ProvCollector/Agent.Linux/Config/ca.crt` |

This is `CertificateHelper.GetKafkaCertificatePath()`'s fallback: it is only
consulted when `Kafka.SslCaLocation` is empty, and the Windows installer's
certificate picker (`browse_cert.vbs`) writes to this exact path, so a
certificate dropped in by hand is indistinguishable from one chosen in the
installer UI.

## Environment

`docker-compose.override.yml` reads the following from your shell or a `.env`
file in the repository root:

| Variable | Purpose |
| --- | --- |
| `EXTERNAL_IP` | Advertised address for the external Kafka listener, so agents outside the bridge network can connect |
| `PROV_USERNAME` / `PROV_PASSWORD` | PostgreSQL superuser credentials |
| `DB_HOST` / `DB_PORT` | Where the .NET services reach PostgreSQL |
| `RP_ADMIN_PASSWORD` | Redpanda superuser, used by `redpanda-init` and the console |
| `RP_AGENT_PASSWORD` | SASL principal `agent` |
| `RP_EP_PASSWORD` | SASL principal `eventprocessor` |
| `RP_DB_PASSWORD` | SASL principal `database` |
| `RP_TM_PASSWORD` | SASL principal `throughputmon` |
| `API_KEY_HASH` | SHA-256 of the agent API key `FleetServer` will accept |


## Toolchain notes

**Rust** is needed only for the Windows registry driver
(`ProvCollector.Agent.Windows.Driver`, built with `cargo-make` against the WDK)
and for the Linux installer binaries. These are built when you run `dotnet build` via 
`.msbuildproj` files that run the required `cargo` commands, you do not need to build them separately.

{: .note }
> A driver must be signed to load on a production Windows host, and unsigned
> local builds require test signing to be enabled on the target machine. The agent
> runs without the driver: setting
> `RegistrySourceOptions.UseProvCollectorDriver: false` falls back to the
> `Microsoft-Windows-Kernel-Registry` ETW provider, which does not work very well.

**WiX** is needed only to build the Windows MSIs. See
[Deploying agents]({{ '/getting-started/deploying-agents/' | relative_url }}).

## Next

- [Quick start]({{ '/getting-started/quickstart/' | relative_url }}) — bring the stack up and run a query.
- [Compose stack]({{ '/operations/compose-stack/' | relative_url }}) — what each service is and which ports it publishes.
