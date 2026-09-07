# ProvCollector documentation site

The public documentation for [ProvCollector](https://gitlab.syssec.org/prov-research/provcollector),
built with [Jekyll](https://jekyllrb.com) and the
[Just the Docs](https://just-the-docs.com) theme.

## Running locally

```bash
bundle install
bundle exec jekyll serve
```

Then open <http://127.0.0.1:4000>.

Changes to `_config.yml` are **not** picked up by the watcher — restart the
server after editing it.

## Layout

| Path | Contents |
| --- | --- |
| `index.md` | Home page — the hero, core ideas, and the architecture figure |
| `getting-started/` | Installation, quick start, deploying agents |
| `architecture/` | The pipeline, the data model, the security model |
| `components/` | One page per component repository |
| `operations/` | Compose stack, Kafka, configuration, CI, invariants |
| `reference/` | Tracker CLI, type registries, settings |
| `meta/` | Contributing, FAQ |
| `_includes/figures/*.mmd` | Mermaid diagram sources — the editable originals |
| `_includes/figures/*.html` | Thin wrappers adding the legend and caption to each |
| `_sass/custom/custom.scss` | All site-specific styling |
| `_sass/color_schemes/` | The `provcollector` light and dark schemes |

## Theming

The site ships two colour schemes, `provcollector` (light) and
`provcollector-dark`, defined in `_sass/color_schemes/`. Three pieces make the
runtime toggle work:

- `assets/css/just-the-docs-provcollector.scss` and
  `…-provcollector-dark.scss` compile each scheme to its own stylesheet.
  Both must exist — `jtd.setTheme(name)` swaps to `just-the-docs-<name>.css`,
  so a scheme with no matching asset leaves the page unstyled.
- `_includes/head_custom.html` picks the scheme before first paint, from
  `localStorage` or `prefers-color-scheme`, so there is no flash.
- `_includes/nav_footer_custom.html` renders the toggle button. Just the Docs
  includes that file **twice** — desktop sidebar and mobile footer — so the
  markup carries no `id` and the script guards against double binding.

Mermaid bakes its palette in at render time rather than reading CSS, so the
toggle calls `window.pcRenderMermaid()` to draw the diagrams again. That function
is defined in `_includes/components/mermaid.html`, which also keeps a copy of
each diagram's source — Mermaid replaces the element's content with the rendered
SVG, so a re-render needs something to work from.

## Diagrams

Diagrams are [Mermaid](https://mermaid.js.org), enabled through the `mermaid:`
key in `_config.yml`. The editable source of each is a `.mmd` file:

| Source | Figure |
| --- | --- |
| `_includes/figures/architecture.mmd` | Figure 1 — the data plane |
| `_includes/figures/management.mmd` | Figure 2 — the management plane |
| `_includes/figures/identity.mmd` | Figure 3 — PID reuse and identity resolution |

Each has a matching `.html` wrapper that adds the legend and caption and drops
the source into a `<pre class="mermaid">`. Edit the `.mmd`, reload, done — no
build step. To work on one outside the site, paste it into
[mermaid.live](https://mermaid.live), preview it in VS Code, or render it:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i _includes/figures/architecture.mmd -o architecture.svg
```

Keep the sources colour-free. Nodes take their appearance from the semantic
classes assigned at the bottom of each file — `topic`, `store`, `management`,
`dataplane`, `event` — which are styled per colour scheme in
`_includes/components/mermaid.html`, alongside the shared layout options in
`_includes/mermaid_config.js`.

Three things that will bite when editing a diagram:

- **Never leave a bare `%%` line.** Mermaid's comment stripper matches `%%`
  followed by content, so an empty marker survives, is concatenated onto the
  following line, and breaks the parse.
- **A subgraph's `direction` is ignored once an edge crosses its border.** That
  is why the two planes are separate figures.
- **The wrapper escapes the source** (`{{ mmd | escape }}`) so that `<br/>` and
  `<b>` survive as text inside the `<pre>` rather than being parsed as HTML.

Mermaid loads from jsDelivr, so diagrams need network access at view time. To
serve it yourself, drop the bundle in `assets/js/` and add `path:` alongside
`version:` under `mermaid:` in `_config.yml`.

## Publishing

Set `url` and `baseurl` in `_config.yml` for wherever the site is served:

| Target | `url` | `baseurl` |
| --- | --- | --- |
| GitHub Pages, project site | `https://<org>.github.io` | `/<repo>` |
| GitHub Pages, user/org site | `https://<org>.github.io` | `""` |
| GitLab Pages | `https://<group>.gitlab.io` | `/<project>` |

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on a push to
`main`. For GitLab Pages, a `.gitlab-ci.yml` job running `bundle exec jekyll
build -d public` and publishing `public/` as the `pages` artifact does the same
job.

## Checking links

```bash
bundle exec jekyll build
```

The build fails on Liquid errors. Internal links are ordinary relative
URLs built with `relative_url`, so they survive a `baseurl` change; if you add
cross-page anchors, verify them against the built `_site/` before publishing.
