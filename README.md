# Repo Context System

Generates structured context for AI coding agents from a GitHub repository, plus a simple DeepWiki-style benchmark proxy. Includes a local API server and a web UI, plus Netlify Functions for a one-click deployment path.

## Features
- Structured JSON context suitable for agent prompts
- Repo analysis with file stats, tech stack hints, and key files
- DeepWiki-style document proxy and coverage scoring
- Local API server with history storage
- Web UI to run analysis and download results
- Netlify Functions for a live deployment

## Structure
- apps/api: local API server
- apps/web: web UI
- netlify/functions: serverless API for Netlify deploys
- packages: shared types and utilities

## Local setup
1) Install dependencies: npm install
2) Start dev servers: npm run dev
3) Open the web UI and submit a repo URL

Environment variables (optional):
- API server: PORT, DB_PATH, CORS_ORIGIN
- Web UI: VITE_API_BASE

## API endpoints (local server)
- POST /api/analyze { repoUrl }
- POST /api/benchmark { repoUrl }
- GET /api/history
- GET /api/health

## Benchmark notes
The benchmark output includes a DeepWiki-style document proxy and a heuristic coverage score. This is not a real DeepWiki run, but provides a structured comparison surface for automation.

## Deploy to Netlify (zip upload)
1) Install dependencies locally and run npm run build:web
2) Zip the repository folder
3) In Netlify, set:
   - Build command: npm run build:web
   - Publish directory: apps/web/dist
   - Functions directory: netlify/functions
4) Set VITE_API_BASE to /api in the Netlify environment
5) Deploy

For production use, consider hosting the API server separately and pointing VITE_API_BASE to that URL.
