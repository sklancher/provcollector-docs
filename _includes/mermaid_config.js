{%- comment -%}
  Base Mermaid configuration, shared by every diagram on the site. Emitted as a
  JavaScript object literal into components/mermaid.html.

  Colours deliberately live in components/mermaid.html instead, because they
  depend on the active colour scheme and have to change when the theme toggle
  does. Put layout and behaviour here; put palette there.
{%- endcomment -%}
{
  startOnLoad: false,
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 12,
    nodeSpacing: 38,
    rankSpacing: 44,
    useMaxWidth: true,
    // Default is 200px, which re-wraps labels that already break themselves
    // with <br/>. Raising it leaves the line breaks under the diagram's control.
    wrappingWidth: 340
  }
}
