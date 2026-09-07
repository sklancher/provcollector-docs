---
title: CI and packages
parent: Operations
nav_order: 4
permalink: /operations/ci-and-packages/
---

# CI and packages
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Each submodule has its own `.gitlab-ci.yml`, running on the .NET 10 SDK image.

## ProvCollector.Common is the only publisher

Its pipeline is **tag-driven**. A tag like `1.0.0` runs:

```bash
dotnet pack -p:Version=$CI_COMMIT_TAG
```

and pushes both the `.nupkg` and the `.snupkg` to the Nexus hosted feed. Untagged
pushes build only.

Two failure modes recur.

### Protected variables need protected tags

If `NUGET_API_KEY` is marked **Protected**, the release tag must be protected too
(Settings → Repository → Protected tags). Otherwise the job receives an empty
variable and fails with a 401 that looks exactly like a bad key.

{: .note }
> The pipeline checks for empty variables and fails with an explicit message,
> since the resulting 401 otherwise suggests a credential problem.

### Push to the V3 service index, not the bare URL

Pushes must target the **V3 service index** (`.../index.json`), not the bare
repository URL.

{: .warning }
> The bare URL is the legacy V2 endpoint. On this Nexus it returns 502 on search
> and 401 on push with any account, because the .NET 10 NuGet client no longer
> sends the API key over that path. The symptom is indistinguishable from a
> credential failure.

## Consumer repositories

`Agent`, `Backend`, `Analysis` and `Management` restore from Nexus and publish
nothing. They need `NUGET_USER` / `NUGET_PASS`, injected before restore:

```bash
dotnet nuget update source nexus.syssec.org \
    --username "$NUGET_USER" --password "$NUGET_PASS" \
    --store-password-in-clear-text
```

{: .warning }
> The source name must match the key in `nuget.config`, because that file
> `<clear />`s inherited sources. Credentials attached to a differently-named
> source are silently not applied.

## Upgrading Common in a consumer

A one-line change to `$(ProvCollectorCommonVersion)` in the consumer's
`Directory.Build.props`. Every `.csproj` in the repository references the packages
through that property, so there is exactly one place to edit.

The full loop for a change that spans repositories:

1. Edit in the superproject's `ProvCollector.Common/` checkout — the single
   editable copy.
2. Commit and tag Common. CI packs and publishes.
3. Bump `$(ProvCollectorCommonVersion)` in each consumer that needs the change.
4. Commit each consumer; update the superproject's submodule pointers.

{: .note }
> A local `dotnet build` of the whole solution will not pick up an uncommitted
> Common change in a consumer project, because consumers reference packages
> rather than projects. This is what keeps the repositories independently
> buildable, at the cost of making cross-repository changes a multi-step
> operation.

## Local and CI parity

Fill `nuget.secrets.config` with the same Nexus account that backs the
`NUGET_USER` / `NUGET_API_KEY` CI variables, so local container builds and
pipeline builds resolve identically. The package *sources* live in each
repository's `nuget.config`; the two files are merged by NuGet.

## Building installers in CI

`ProvCollector.Management/Build-Installers.ps1` builds a configured agent
installer for either platform, injecting Kafka settings and a CA certificate into
the platform's `default.yaml` before packaging. Windows produces MSIs from the
WiX v6 projects; Linux produces self-extracting Rust setup binaries.

Uploaded packages are served to updaters through `/api/v1/updates`, with
`PackageManagementService` publishing a SHA-256 digest per package. The updater
verifies that digest before installing, and refuses to install a package for
which no digest is published.
