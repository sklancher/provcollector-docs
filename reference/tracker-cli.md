---
title: Tracker CLI
parent: Reference
nav_order: 1
permalink: /reference/tracker-cli/
---

# Tracker CLI
{: .no_toc }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

`ProvCollector.Tracker` runs a time-respecting traversal per seed object and
writes each result as a NetworkX-compatible JSON graph.

```bash
ProvCollector.Tracker --csv seeds.csv --direction Backward --algorithm BFS \
    --output-dir Output --node-limit 50000
```

## Options

Every option has a config-file equivalent under the `Tracker` section, with the
command line taking precedence — the same layering
[every service uses]({{ '/operations/configuration/' | relative_url }}).

| Option | Config key | Meaning |
| --- | --- | --- |
| `--csv` | — | Seed file of `id,label` pairs. `-` reads stdin |
| `--direction, -d` | — | `Forward`, `Backward` or `Combined` |
| `--algorithm, -a` | `Algorithm` | `BFS` or `DFS` |
| `--id-type, -i` | `IdType` | Whether seeds name `Node`s or `Edge`s |
| `--concurrency` | `Concurrency` | Traversals in flight (default 4) |
| `--prefetch` | `Prefetch` | Nodes fetched per batch during traversal (default 10) |
| `--min-timestamp` | `MinRealtimeTimestamp` | ISO-8601 UTC lower bound |
| `--max-timestamp` | `MaxRealtimeTimestamp` | ISO-8601 UTC upper bound |
| `--edge-whitelist` | `EdgeWhitelist` | Event type GUIDs to include |
| `--edge-blacklist` | `EdgeBlacklist` | Event type GUIDs to exclude |
| `--node-whitelist` | `NodeWhitelist` | Object type GUIDs to include |
| `--node-blacklist` | `NodeBlacklist` | Object type GUIDs to exclude |
| `--node-limit` | `NodeLimit` | Per-query traversal bound |
| `--edge-limit` | `EdgeLimit` | Per-query traversal bound |
| `--output-dir, -o` | `OutputDir` | Result directory |
| `--output-template` | `OutputTemplate` | Filename pattern, default `{Label}-{Id}-{Direction}.json` |
| `--overwrite` | `Overwrite` | Replace existing results |
| `--config` | — | Alternative YAML config path |

## Seeds

A seed file is `id,label` pairs, one per line:

```csv
id,label
3f2504e0-4f89-11d3-9a0c-0305e82c3301,suspicious-dropper
7b1c1e10-9a1b-4a3f-8bd1-2c4a4b7e91aa,exfil-candidate
```

`--csv -` reads the same format from stdin, which is how it is usually driven
from a query:

```bash
psql -Atc "SELECT id || ',' || (properties->>'Name') FROM nodes WHERE ..." \
  | ProvCollector.Tracker --csv - --direction Backward -o Output
```

`SeedParser` handles parsing; `TraversalExecutor` runs traversals with bounded
concurrency over `ProvenanceTracker.Track`.

## Direction

| Direction | Follows | Answers |
| --- | --- | --- |
| `Backward` | Edges at or **before** the time the node was reached | What produced this? |
| `Forward` | Edges at or **after** the time the node was reached | What did this affect? |
| `Combined` | Both, from the seed | Full neighbourhood in causal terms |

{: .rationale }
> The time constraint is what separates a provenance query from a reachability
> query. If A wrote F at 09:00 and B read F at 08:00, an unconstrained graph walk
> reaches B from A although no data passed between them. A forward walk from A
> does not follow that edge.

## Limits

{: .warning }
> A backward traversal from a frequently accessed file can reach most of the
> database. `--node-limit` and the timestamp bounds are what keep such a query
> finite, and should be treated as required in practice.

Sensible starting points:

```bash
--node-limit 50000 --edge-limit 200000 \
--min-timestamp 2026-09-01T00:00:00Z --max-timestamp 2026-09-02T00:00:00Z
```

Narrow the time window before raising the node limit. A traversal bounded to one
day around an incident generally returns a more useful result than an unbounded
traversal truncated at 50 000 nodes, since truncation discards nodes in traversal
order rather than by relevance.

## Type filters

Whitelists and blacklists take type GUIDs rather than names; see the
[type registry]({{ '/reference/event-types/' | relative_url }}). Filtering edges
by family has the largest effect on traversal size. Excluding `FileRead` and
`FileOpen` removes the majority of edges in most graphs and leaves write-side
causality intact.

## Output

One JSON file per seed, named by `--output-template` (default
`{Label}-{Id}-{Direction}.json`) in `--output-dir`. The format is
NetworkX-compatible, so results load directly:

```python
import json, networkx as nx
g = nx.node_link_graph(json.load(open("suspicious-dropper-3f2504e0-...-Backward.json")))
```

`--overwrite` replaces existing results; without it, a seed whose output file
already exists is skipped, which makes re-running an interrupted batch cheap.

## Concurrency and prefetch

`--concurrency` (default 4) is the number of traversals in flight;
`--prefetch` (default 10) is the number of nodes fetched per batch within a
traversal. Their product bounds the concurrent load on the database, so raising
concurrency on a shared instance degrades other queries.

## Interactive alternative

For exploration rather than batch extraction, the
[Visualizer]({{ '/components/analysis/#provcollectorvisualizer' | relative_url }})
runs the same traversal against the same engine and renders the result in the
browser, materialising the subgraph into an `InMemoryGraph` so panning and
filtering do not re-query.
