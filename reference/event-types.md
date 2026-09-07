---
title: Event and object types
parent: Reference
nav_order: 2
permalink: /reference/event-types/
---

# Event and object types
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

Event and object types are GUIDs, declared as C# enums annotated with
`[ProvenanceType]` in `ProvenanceEvents.cs` and `ProvenanceObjects.cs`. The GUID
is the wire value; the enum and its `NiceName` exist for code and for display.
Both registries carry cached bidirectional GUID lookups.

## Object types

| Type | Typically identified by |
| --- | --- |
| `Process` | PID + start time (strong), PID alone (weak) |
| `File` | Path, volume GUID |
| `Dns` | Queried name |
| `RegistryKey` | Resolved key path |
| `RegistryValue` | Key path + value name |
| `Ip` | Address, port, protocol |
| `Account` | SID |

`ProvenanceObjects` provides typed factory helpers — `ProvenanceObjects.Process`,
`.File`, `.Ip`, `.Dns`, `.RegistryKey`, `.RegistryValue`, `.Account` — which
assemble the property map with the right `IdentifierBehavior` and
`identifier_priority` values. An event source never hand-builds one, which is
what keeps identity semantics consistent across sources.

## Event types by family

### Process

`ProcessStart`, `ProcessStop`, `ImageLoad`, `ImageUnload`

Collected from `Microsoft-Windows-Kernel-Process` with keywords
`PROCESS | IMAGE`, or from the NT Kernel Logger when
`ProcessSourceOptions.UseKernelLogger` is set.

`ProcessStart` and `ProcessStop` are the events that drive process identity
lifecycle: `ProcessStart` carries `identity_op` semantics that create or unify,
`ProcessStop` destroys.

### File

`FileCreate`, `FileOpen`, `FileRead`, `FileWrite`, `FileDelete`, `FileRename`,
`FileClose`, `FileCleanup`, `FileNameCreate`, `FileNameDelete`

From `Microsoft-Windows-Kernel-File`. This family has the highest volume;
`FileRead` and `FileOpen` account for the majority of edges in most graphs.
Excluding them with `--edge-blacklist` reduces traversal size substantially and
leaves write-side causality intact.

### Registry

`RegistryCreateKey`, `RegistryOpenKey`, `RegistryQueryKey`, `RegistrySetKey`,
`RegistryDeleteKey`, `RegistrySetValueKey`, `RegistryQueryValueKey`,
`RegistryEnumerateValueKey`, `RegistryDeleteValueKey`

From the bundled `ProvCollector-Agent-Windows-Provider` driver by default, or
`Microsoft-Windows-Kernel-Registry` when
`RegistrySourceOptions.UseProvCollectorDriver` is `false`.

{: .note }
> `Microsoft-Windows-Kernel-Registry` logs a handle rather than a resolved path,
> so key paths obtained from it are largely incomplete. Within its callback the
> driver still holds the key object and can resolve the full path.

### Network

`TcpSend`, `TcpReceive`, `TcpRetransmit`, `TcpConnectionAttempt`,
`TcpConnectionAccept`, `TcpDisconnect`, `UdpSend`, `UdpReceive`

From `Microsoft-Windows-Kernel-Network`, keyword `0x30`. This provider cannot be
enabled through an ETW AutoLogger, so it is attached to the live session after
the service starts — meaning network events during early boot are not captured.

### DNS

`DnsQueryComplete`

From `Microsoft-Windows-DNS-Client`, query completions only.

### Account

`LoginSuccess`, `LoginFail`, `ExplicitCredLogin`, `AccountCreate`,
`AccountEnable`, `AccountDisable`, `AccountDelete`, `AccountPasswordChange`,
`AccountPasswordReset`, `ComputerCreate`, `ComputerChange`, `ComputerDelete`

`AccountEventSource` does not consume ETW. It subscribes to the Security event
log with an XPath query selecting event IDs 4624, 4625, 4648, 4720, 4722–4726
and 4741–4743, covering logon success and failure, explicit-credential logon,
and account and computer object lifecycle.

### Other

`Information`

## Event-scoped properties

`EventProperties.cs` supplies extension methods for the common event-scoped
properties, so a source sets them by name rather than by constructing
`PropertyData` directly:

| Property | Carried on |
| --- | --- |
| `ThreadId` | Most kernel events |
| `IOSize` | File read/write |
| `IOFlags` | File operations |
| `ExitCode` | `ProcessStop` |
| `UserSID` | Account events, process start |
| `IpInfo` | Network events |

## Which sources produce which families

| Config name | Provider | Families |
| --- | --- | --- |
| `Process` | `Microsoft-Windows-Kernel-Process` | Process |
| `FileIO` | `Microsoft-Windows-Kernel-File` | File |
| `IP` | `Microsoft-Windows-Kernel-Network` | Network |
| `DNS` | `Microsoft-Windows-DNS-Client` | DNS |
| `Registry` | ProvCollector driver, or kernel registry | Registry |
| `Account` | Security event log | Account |

Enable them by name in `EventSource:EnabledSources`. A source that fails to
construct is logged and skipped, and the remaining sources continue.
