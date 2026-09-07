---
title: Security model
parent: Architecture
nav_order: 3
permalink: /architecture/security/
---

# Security model
{: .no_toc }

The reach of each credential in the system, and the limits placed on it.
{: .pc-lead }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## The two planes

The data plane and the management plane share the monitored host and nothing
else.

| | Data plane | Management plane |
| --- | --- | --- |
| Carries | Provenance events | Fleet control |
| Transport | Kafka (TLS + SASL/SCRAM-SHA-256) | SignalR / HTTPS |
| Direction | One-way, agent → backend | Bidirectional |
| Host component | Collection Agent | Updater |
| Backend | EventProcessor, Writer, PostgreSQL | FleetServer, AgentDashboard |
| Can read collected provenance | Yes | **No** |
| Can instruct a host to install software | **No** | Yes |

An operator with dashboard access cannot read collected provenance, and a
compromised collection path cannot issue installer instructions. Downstream
collection components cannot reach back into monitored hosts: the data path is
a Kafka topic that an agent can only write to.

{% include figures/management.html %}

## Kafka ACLs

Each service operates under a dedicated SASL principal restricted to minimum
required privileges:

| Principal | Grants |
| --- | --- |
| `agent` | Write/describe/create on `RawEvents`; idempotent-write on cluster |
| `eventprocessor` | Read on `RawEvents`; write on `ProcessedEvents`; read/write on `IdentityChangelog`; consumer group access |
| `database` | Read/describe on `ProcessedEvents`; consumer group access |
| `throughputmon` | Read/describe on `RawEvents` and `ProcessedEvents`; consumer group access |
| `admin` | Superuser administration and schema registry access |

{: .rationale }
> An agent credential compromised on a monitored host permits event injection
> into `RawEvents`. It does not permit reading the event stream, reading
> `ProcessedEvents`, or accessing identity changelogs. Injection remains a host
> compromise risk, but exfiltration of the fleet's collected provenance through a
> single compromised agent is prevented.

## Credentials at rest

Agent Kafka credentials are stored encrypted in local configuration files and
decrypted in memory at service startup using platform-native protection (DPAPI
on Windows, OS credential stores on Linux). Plaintext credentials can be used
in local development environments.

## Fleet hub authentication

Agents connecting to the management plane authenticate using API keys. Key
digests are compared using constant-time verification to prevent timing
side-channels. Connections presenting invalid or missing credentials are
immediately rejected prior to registration.

{: .warning }
> If no API key hashes are configured on the fleet server, all agent
> connections are rejected by default.

### API surface separation

The fleet server isolates endpoints into three distinct URL paths with
independent authorization policies:

| Prefix | Consumer | Stability |
| --- | --- | --- |
| `/api/v1/agent` | Updaters (SignalR hub) | **Frozen** — deployed agents depend on it |
| `/api/v1/updates` | CI pipelines and package tools | Published contract |
| `/api/v1/fleet` | AgentDashboard UI | Internal administration |

All error responses adhere to the RFC 9457 Problem Details standard with
structured machine-readable error codes.

## Package integrity

Software packages distributed by the management plane are verified against
published SHA-256 digests prior to execution. Packages failing validation are
deleted immediately. Download and extraction routines enforce strict boundary
checks to prevent path traversal attacks.

{: .warning }
> Disabling TLS certificate validation (`AllowInvalidCertificates`) should only
> ever be used in isolated development setups. Disabling validation on channels
> carrying installer instructions creates an unauthenticated remote execution
> vector under `LocalSystem`.

## Transport encryption

All inter-component communication is encrypted in transit:

- **Kafka**: TLS encryption with SASL/SCRAM-SHA-256 authentication.
- **PostgreSQL**: SSL encryption with CA certificate validation.
- **Fleet Management**: HTTPS and WSS with TLS certificate validation.

## Telemetry isolation

Collection agents filter out their own process and network activity to prevent
recursive feedback loops in the provenance stream. Monitored host agents run with
elevated privileges (`LocalSystem` on Windows, `root` on Linux) to access kernel
event providers, security event logs, and kernel drivers.

## Residual risks

- **Event injection**: A compromised endpoint holds valid credentials to write
  into `RawEvents`. Downstream stages cannot distinguish fabricated telemetry
  from genuine OS events.
- **Induced collection gaps**: Under heavy host resource exhaustion or deliberate
  flooding, the agent's bounded buffer drops events to protect kernel stability.
  While drops are counted, an attacker can exploit this to create blind spots.
- **Traversal resource consumption**: Deep traversals across dense subgraphs can
  demand substantial memory. Time-bounded filters and node limits are required to
  bound query cost.
