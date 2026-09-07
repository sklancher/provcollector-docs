---
title: Operations
nav_order: 5
has_children: true
permalink: /operations/
---

# Operations
{: .no_toc }

The deployment topology, the settings that must agree across services, and the
failure modes that follow when they do not.
{: .pc-lead }

<ul class="pc-cards" markdown="0">
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/compose-stack/' | relative_url }}">Compose stack</a></p>
    <p>Every service in the topology, the ports it publishes, and the certificates and environment it expects.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/kafka/' | relative_url }}">Kafka topics and ACLs</a></p>
    <p>The three topics, their retention and partitioning, and the per-role principal that may touch each one.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/configuration/' | relative_url }}">Configuration</a></p>
    <p>The six-layer precedence chain every service shares, the per-platform paths, and credential protection.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/ci-and-packages/' | relative_url }}">CI and packages</a></p>
    <p>The tag-driven Common pipeline, the two failure modes that recur, and how consumers upgrade.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/invariants/' | relative_url }}">Operational invariants</a></p>
    <p>The short list of settings that must agree across services, and what breaks when they do not.</p>
  </li>
</ul>

## Start here if something is wrong

| Symptom | Look at |
| --- | --- |
| Every service fails at once | `redpanda-init` logs — it creates users, ACLs and topics, and everything else assumes it succeeded |
| Broker will not start | [Certificates]({{ '/operations/compose-stack/#certificates' | relative_url }}) — there is no self-signed fallback |
| Agent connects but no events land | [ACLs]({{ '/operations/kafka/#acls' | relative_url }}) — the `agent` principal may write `RawEvents` only |
| Agent rejected at the fleet hub | `API_KEY_HASH` unset; `FleetServer` refuses every agent when no hashes are configured |
| Image build fails on restore | [Build secrets]({{ '/operations/compose-stack/#build-secrets' | relative_url }}) — `nuget.secrets.config` missing or wrong source name |
| Process nodes carry only a PID | [Invariants]({{ '/operations/invariants/' | relative_url }}) — carry-forward window mismatch |
| History splits at a restart | `SkipIdentityRestore` is on, or the changelog is disabled |
| Memory climbing on the processor | `MaxTrackedIdentities` set to 0, which disables the cap |
| Package publish 401s | [CI]({{ '/operations/ci-and-packages/' | relative_url }}) — protected variable, or a V2 push URL |
