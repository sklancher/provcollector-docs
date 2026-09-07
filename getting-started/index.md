---
title: Getting started
nav_order: 2
has_children: true
permalink: /getting-started/
---

# Getting started

From an empty directory to a running backend with an agent reporting into it.
{: .pc-lead }

ProvCollector is developed as a **superproject**: one repository that carries no
application code of its own, pinning five component repositories as git
submodules and holding the solution file, the Docker Compose topology and the
shared NuGet configuration that ties them together.

<ul class="pc-cards" markdown="0">
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/getting-started/installation/' | relative_url }}">Installation</a></p>
    <p>Clone with submodules, satisfy the toolchain, restore from the package feed, and build the whole solution.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/getting-started/quickstart/' | relative_url }}">Quick start</a></p>
    <p>Bring up the Compose stack, confirm the topics exist, and run your first traversal against the graph.</p>
  </li>
  <li class="pc-card">
    <p class="pc-card__title"><a href="{{ '/getting-started/deploying-agents/' | relative_url }}">Deploying agents</a></p>
    <p>Build a configured installer for Windows or Linux and get a host reporting into the stack.</p>
  </li>
</ul>

## Requirements


| Requirement | Notes |
| --- | --- |
| [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/10.0) | --- |
| [Docker Compose](https://docs.docker.com/compose/install/) | This is the easiest way to deploy ProvCollector; you can also deploy manually |
| [WiX Toolset](https://github.com/wixtoolset/wix/releases/) | Required to build the Windows MSI installers |
| [Rust](https://rust-lang.org/learn/get-started/) | Required to build the Windows driver and Linux installers |
| [`cargo-make`](https://sagiegurari.github.io/cargo-make/) | Required to build the Windows driver | 
| [Windows SDK & WDK](https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk) | Required to build the Windows driver | 

{: .note }
> The `ProvCollector.Common` libraries are consumed as **NuGet packages**, not
> project references. For development, you will likely want to change this to 
> use project references instead.

## Repository layout

| Path | Contents |
| --- | --- |
| `ProvCollector.Common/` | Shared libraries |
| `ProvCollector.Agent/` | Collection agents plus the Windows registry driver |
| `ProvCollector.Backend/` | Event processor and database writer |
| `ProvCollector.Analysis/` | Query, visualisation and reporting tools |
| `ProvCollector.Management/` | Deployment management, updater and installers |
| `ProvCollector.slnx` | Solution spanning every project in every submodule |
| `docker-compose.yml` | Backend topology: Redpanda, PostgreSQL, and the .NET services |
| `nuget.config` | ProvCollector package sources |

