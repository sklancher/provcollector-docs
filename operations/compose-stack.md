---
title: Compose stack
parent: Operations
nav_order: 1
permalink: /operations/compose-stack/
---

# Compose stack
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

`docker-compose.yml` defines the backend topology;
`docker-compose.override.yml` adds the development environment, published ports
and mounted certificates. All services share the `redpanda_network` bridge.

## Services

| Service | Published port | Role |
| --- | --- | --- |
| `redpanda-0` | 18081 (schema registry), 19092 (external Kafka), 19644 (admin) | Kafka-API broker, TLS + SASL |
| `redpanda-init` | — | One-shot: creates users, ACLs and topics, then exits |
| `console` | 443 | Redpanda Console — browse topics and consumer groups |
| `postgres` | 5434 | Provenance database, SSL on |
| `provcollector.eventprocessor` | — | Ordering and identity resolution |
| `provcollector.database.postgres.writer` | — | `ProcessedEvents` into PostgreSQL |
| `provcollector.fleetserver` | 5080 | Agent hub and operator API |
| `provcollector.agentdashboard` | 8082 | Fleet operator UI |
| `provcollector.visualizer` | 8080 | Graph exploration UI |
| `provcollector.throughputmonitor` | 8083 | Live topic throughput UI |
| `provcollector.botreporter` | — | Scheduled Slack reports |

{: .note }
> `redpanda-init` is a one-shot container and exits on completion. An exit code
> other than zero is the usual root cause when every other service fails at
> once, since the topics, users and ACLs they depend on were never created.

Each .NET service builds from its own submodule as the Docker context — the event
processor, for example, uses context `./ProvCollector.Backend` with dockerfile
`ProvCollector.EventProcessor/Dockerfile` — so the image build sees only that
repository.

## Certificates

The stack expects TLS material already present on the host:

```
/opt/ProvCollector/redpanda-certs/{ca.crt,redpanda.crt,redpanda.key}
/opt/ProvCollector/postgres-certs/{ca.crt,server.crt,server.key}
```

They are bind-mounted read-only into the broker, the console and PostgreSQL.

{: .warning }
> There is no self-signed fallback. A missing file prevents the broker from
> starting, and the failure surfaces as connection errors in every dependent
> service rather than as a certificate error.

## Environment variables

`docker-compose.override.yml` reads these from your shell or a `.env` file:

| Variable | Purpose |
| --- | --- |
| `EXTERNAL_IP` | Advertised address for the external Kafka listener, so agents outside the bridge can connect |
| `PROV_USERNAME` / `PROV_PASSWORD` | PostgreSQL superuser credentials |
| `DB_HOST` / `DB_PORT` | Where the .NET services reach PostgreSQL |
| `RP_ADMIN_PASSWORD` | Redpanda superuser, used by `redpanda-init` and the console |
| `RP_AGENT_PASSWORD` | SASL principal `agent` — produce to `RawEvents` |
| `RP_EP_PASSWORD` | SASL principal `eventprocessor` |
| `RP_DB_PASSWORD` | SASL principal `database` |
| `RP_TM_PASSWORD` | SASL principal `throughputmon` |
| `API_KEY_HASH` | SHA-256 of the agent API key accepted by `FleetServer` |

`EXTERNAL_IP` requires particular care. Agents run outside the Compose bridge
network, so the broker's advertised address must be one they can resolve and
route to; a container name or `localhost` will not serve.

## Build secrets

Image builds restore the `ProvCollector.Common.*` packages from Nexus, which
needs credentials that must not land in a layer. Compose mounts
`nuget.secrets.config` as a **build secret**, referenced only in the `RUN` lines
that restore:

```bash
cp nuget.secrets.config.example nuget.secrets.config
```

Fill in the same Nexus account that backs the `NUGET_USER` / `NUGET_API_KEY` CI
variables, so local and pipeline builds resolve identically. The file is
gitignored; the package *sources* live in each repository's `nuget.config`, and
the two are merged by NuGet.

{: .warning }
> The source name in your secrets file must match the key in `nuget.config`.
> That file `<clear />`s inherited sources, so credentials attached to a
> differently-named source are not applied and the restore fails with a 401 that
> resembles an authentication failure.

## Bringing it up

```bash
docker compose up -d
docker compose ps
docker compose logs -f provcollector.eventprocessor
```

Startup order is broker, then `redpanda-init`, then the remaining services. When
debugging a cold start, examine `redpanda-init` first.

## The UIs

| URL | What it is |
| --- | --- |
| `https://<host>:443` | Redpanda Console — topics, consumer groups, message inspection |
| `http://<host>:8080` | Visualizer — interactive graph exploration |
| `http://<host>:8082` | AgentDashboard — fleet overview, config push, package rollout |
| `http://<host>:8083` | ThroughputMonitor — live per-topic event rates |
| `http://<host>:5080` | FleetServer API — not a UI; the dashboard's backend |

ThroughputMonitor on port 8083 gives the earliest indication of whether
collection is working.
