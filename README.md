# @pipeworx/fragile-states-index

Annual country fragility score and rank — country-risk context to pair with
event/news data, so a spike of unrest or instability news for a country can be
read against its standing fragility level.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `fsi_country_score(country)` — the Index score, rank and total country count
  for one country (e.g. "which countries have the worst state-fragility risk
  right now, and where does X stand").
- `fsi_ranking(limit, direction)` — the N most fragile or N most stable
  countries, ranked, in one call.

## Auth

Keyless.

## Data sources

- The Fund for Peace, Fragile States Index — an annual composite score (0 most
  stable, 120 most fragile) built from twelve cohesion, economic, political
  and social indicators, covering nearly 180 countries and territories.

## Licence

The Fund for Peace licenses the Index under a Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International License and asks anyone
wanting to republish it for commercial purposes to contact them directly.
Bruce ruled 2026-10-17 to ship this pack anyway — zero-rated (0 credits on
every tier, never counted toward volume pricing) and carrying the publisher's
attribution in every response's `source` field — the same shape as the
symmap (#1385) and openvc-share-too case rulings. See CLAUDE.md's licence
section for the ruling text.

## Data freshness

Published only as an annual bulk file (no live query API), so this pack reads
from a periodically-refreshed copy rather than a per-request live call. Every
response carries `data_as_of` (when this pack's copy was last refreshed) and
`year` (the edition's own data year) — check both before citing a figure as
current; the publisher's annual cycle means a given edition can be the
"latest" for most of a year.

## Common pitfalls

- Country names are the publisher's own spelling (e.g. "Congo Democratic
  Republic", "Congo Republic", "Cote d'Ivoire", "United States") — a handful
  of common aliases (USA, UK, DRC, Ivory Coast...) are accepted, but a bare
  "Congo" is deliberately NOT resolved to either Congo, since guessing between
  the two would be a wrong answer rather than a convenience; pass the full
  name the tool's error message lists.
- Lower score = more stable; lower rank number = MORE fragile (rank 1 is the
  most fragile country, not the least).

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "fragile-states-index": {
      "url": "https://gateway.pipeworx.io/fragile-states-index/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/fragile-states-index/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/fsi_country_score \
  -H 'Content-Type: application/json' \
  -d '{"country":"Somalia"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/fsi_country_score`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-fragile-states-index` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/fragile-states-index/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "fragile-states-index": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-fragile-states-index"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Fragile States Index data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
