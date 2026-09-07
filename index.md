---
title: Home
layout: home
nav_order: 1
description: >-
  ProvCollector is a distributed system-provenance collection platform: agents
  turn OS telemetry into a uniform event stream, a backend resolves stable object
  identities, and a partitioned PostgreSQL graph backs query, visualisation and
  reporting.
permalink: /
---

<div class="pc-hero" markdown="0">
  <p class="pc-hero__eyebrow">Next-generation system provenance data collection</p>
  <h1>ProvCollector</h1>
  <p class="pc-hero__lede">
    A distributed platform for collecting, storing and querying whole-system
    provenance. Agents on monitored hosts turn OS telemetry into a uniform event
    stream; a backend resolves that stream into stable object identities and
    writes it into a partitioned PostgreSQL provenance graph; analysis tools
    query, visualise and report on the result; a management plane installs,
    configures and updates the agent fleet.
  </p>
  <div class="pc-hero__actions">
    <a class="pc-btn pc-btn--primary" href="{{ '/getting-started/' | relative_url }}">Get started</a>
    <a class="pc-btn" href="{{ '/architecture/' | relative_url }}">Read the architecture</a>
    <a class="pc-btn" href="{{ site.repo.root }}">Source</a>
  </div>
</div>

## Introduction

System provenance is a record of the causal dependencies between the objects an
operating system manages. Processes, files, sockets, and other system objects form the vertices of a directed graph; each operation observed between
two of them (i.e. a process creating another process, a process writing to a file, a process receiving a network packet) forms a directed edge representing the flow of data. 
This graph-structured log data enables tracing causal flows forward in time, to uncover the downstream effects of a system event, or backward, to find the root cause of an event.

ProvCollector implements the collection and storage layer of a system provenance pipeline.
The ProvCollector agent translates diverse operating system telemetry into a
uniform event representation. A streaming backend resolves transient descriptors (e.g. PID, file path)
to persistent object identifiers, and materialises the resulting graph into a database. 
Alongside the data collection pipeline, we include analysis tools to conduct interactive graph exploration, extract subgraphs via backtracking and forwardtracking, and monitor deployment health. ProvCollector also provides a management plane to simplify the deployment, configuration, and maintenance of the agent across a large fleet of hosts.

Provenance-based intrusion detection systems (PIDSs) can consume the ProvCollector graph by utilizing the database for historical analysis, or subscribing to the Kafka stream for live detection.

## Architecture at a glance

{% include figures/architecture.html %}

The [Architecture]({{ '/architecture/' | relative_url }}) section describes each
stage in more detail.
## Where to go next

<ul class="pc-cards" markdown="0">
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/getting-started/' | relative_url }}">Getting started</a></p>
    <p>Clone the superproject, build the solution, bring up the Compose stack, and get an agent reporting into it.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/architecture/' | relative_url }}">Architecture</a></p>
    <p>The pipeline stage by stage, the wire contract and identity model, and the security boundary between the two planes.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/components/' | relative_url }}">Components</a></p>
    <p>What lives in each of the five repositories, and which project does what inside them.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/operations/' | relative_url }}">Operations</a></p>
    <p>The Compose topology, Kafka topics and ACLs, configuration precedence, secrets, CI and installer builds.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/reference/' | relative_url }}">Reference</a></p>
    <p>Tracker CLI options, event and object type registries, and the settings that matter in production.</p>
  </li>
</ul>

