# Repo Context Engine

Analyze any public GitHub repo and generate structured context for AI coding agents.

This project includes:
- Part 1: Context engine (`/api/analyze`)
- Part 2: DeepWiki benchmark + reproducible multi-repo eval (`/api/benchmark`, `/api/eval`)
- Part 3: Deployable web app (`apps/web`) + serverless API (`netlify/functions`)

## What It Produces

For each repository URL, the engine returns:
- Project summary (purpose, stack, organization)
- Architecture map (major directories/modules and relationships)
- Conventions (naming/error-handling/testing signals)
- Key files with reasons (high-signal onboarding targets)

The result is emitted as consistent JSON for agent consumption.

## Monorepo Layout

```
apps/
  api/          Express API + SQLite history + eval runner
  web/          React + Vite UI
packages/
  core/         Analysis engine, AI summary, DeepWiki comparison rubric
netlify/
  functions/    Serverless endpoints for deploy
reference/
  deepwiki-mcp.md
  eval-repos.md
```

## Local Run

```bash
npm install
cp .env.example .env
npm run dev
```

Default local URLs:
- Web: `http://localhost:5173`
- API: `http://localhost:3001`

## API Endpoints

- `POST /api/analyze` body `{ "repoUrl": "https://github.com/owner/repo" }`
- `POST /api/benchmark` body `{ "repoUrl": "https://github.com/owner/repo" }`
- `POST /api/deepwiki` body `{ "repoUrl": "https://github.com/owner/repo" }`
- `POST /api/eval` body `{ "repoUrls": ["...", "...", "..."] }` (3-10 repos)
- `GET /api/history`
- `GET /api/health`

## Reproducible Eval (Part 2)

Run benchmark across 3+ public repos:

```bash
npm --workspace apps/api run eval
```

Default benchmark repos:
- `https://github.com/honojs/hono`
- `https://github.com/langchain-ai/langchain`
- `https://github.com/vercel/next.js`

Or pass your own:

```bash
npm --workspace apps/api run eval https://github.com/expressjs/express https://github.com/pallets/flask https://github.com/facebook/react
```

Artifacts are written to:
- `apps/api/data/eval-latest.json`
- `apps/api/data/eval-latest.md`

Scoring dimensions:
- Structured Output
- Architecture Coverage
- Onboarding Actionability
- Convention Signal
- Agent Readability

## Latest Local Benchmark Snapshot

From `apps/api/data/eval-latest.md`:
- express: ours 96 vs DeepWiki 80
- flask: ours 88 vs DeepWiki 80
- react: ours 96 vs DeepWiki 80
- aggregate: ours 93 vs DeepWiki 80

## Build

```bash
npm run build
```

This builds:
1. `packages/core`
2. `apps/api`
3. `apps/web`

## Deploy (Part 3)

### Netlify

Set in Netlify:
- Build command: `npm run build:web`
- Publish directory: `apps/web/dist`
- Functions directory: `netlify/functions`

Optional environment variables:
- `LLM_API_KEY`
- `LLM_MODEL`
- `VITE_API_BASE`
- `DEEPWIKI_TOKEN` or `DEVIN_API_KEY` (for authenticated DeepWiki/Devin access)
- `DEEPWIKI_ENDPOINT` (defaults to `https://mcp.devin.ai/mcp` when token is present, otherwise `https://mcp.deepwiki.com/mcp`)
- `GITHUB_TOKEN` (optional, improves GitHub API limits for Netlify ZIP-based repository fetches)

The web UI lets users enter a GitHub repo URL and receive analysis output directly.
