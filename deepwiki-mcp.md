# DeepWiki MCP API Reference

[DeepWiki](https://deepwiki.org/) by Cognition (Devin AI) generates wiki-style documentation for GitHub repositories. Read the [announcement blog post](https://cognition.ai/blog/deepwiki) for background on what it does.

It exposes a public MCP (Model Context Protocol) API — no authentication required for public repos.

## Endpoint

```
https://mcp.deepwiki.com/mcp
```

Protocol: Streamable HTTP (JSON-RPC 2.0)

## Available Tools

### `read_wiki_structure`

Returns the table of contents as a numbered, indented list.

```bash
curl -s -X POST "https://mcp.deepwiki.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "read_wiki_structure",
      "arguments": { "repoName": "facebook/react" }
    }
  }'
```

### `read_wiki_contents`

Returns the full wiki content as Markdown — all pages concatenated with Mermaid diagrams, source citations, and tables.

```bash
curl -s -X POST "https://mcp.deepwiki.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "read_wiki_contents",
      "arguments": { "repoName": "facebook/react" }
    }
  }'
```

### `ask_question`

Answers questions grounded in the repo's codebase. Supports querying multiple repos (max 10).

```bash
curl -s -X POST "https://mcp.deepwiki.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "ask_question",
      "arguments": {
        "repoName": "facebook/react",
        "question": "How does the fiber reconciler work?"
      }
    }
  }'
```

## Response Format

All tools return `{ result: string }` where `result` is plain Markdown text.

The response may arrive as a stream of Server-Sent Events. Parse the final `result` event for the complete output.

## Web Access

You can also view DeepWiki output in a browser at `https://deepwiki.com/{owner}/{repo}`.

## Notes

- No auth required for public repos
- Private repos require a Devin subscription and the authenticated endpoint at `https://mcp.devin.ai/mcp`
- Pre-indexed repos return instantly; unindexed repos are analyzed on demand (may take a few minutes)
- Re-indexing has a 7-day cooldown
