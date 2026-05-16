import fs from "fs/promises";
import os from "os";
import path from "path";
import simpleGit from "simple-git";
import {
  analyzeRepo,
  BenchmarkResult,
  compareAgainstDeepWiki,
  generateAISummary,
  generateHeuristicSummary,
  getLLMProvider
} from "@repo/core";

export type BenchmarkPayload = {
  context: Awaited<ReturnType<typeof analyzeRepo>>;
  benchmark: BenchmarkResult;
};

export type MultiRepoEvalResult = {
  evaluatedAt: string;
  repos: BenchmarkPayload[];
  aggregate: {
    totalRepos: number;
    oursAverage: number;
    deepWikiAverage: number;
    oursWins: number;
    deepWikiWins: number;
    ties: number;
  };
};

export const DEFAULT_BENCHMARK_REPOS = [
  "https://github.com/honojs/hono",
  "https://github.com/langchain-ai/langchain",
  "https://github.com/vercel/next.js"
];

export async function analyzeRepoFromUrl(repoUrl: string): Promise<Awaited<ReturnType<typeof analyzeRepo>>> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();
  const llmApiKey = process.env.LLM_API_KEY;
  const llm = getLLMProvider(llmApiKey, process.env.LLM_MODEL);

  try {
    await git.clone(repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    const context = await analyzeRepo(repoUrl, tempDir);
    if (llm) {
      try {
        context.aiSummary = await generateAISummary(context, llm);
      } catch {
        context.aiSummary = generateHeuristicSummary(context);
      }
    } else {
      context.aiSummary = generateHeuristicSummary(context);
    }
    return context;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function benchmarkRepoFromUrl(repoUrl: string): Promise<BenchmarkPayload> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();
  const llmApiKey = process.env.LLM_API_KEY;
  const llm = getLLMProvider(llmApiKey, process.env.LLM_MODEL);

  try {
    await git.clone(repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    const context = await analyzeRepo(repoUrl, tempDir);
    if (llm) {
      try {
        context.aiSummary = await generateAISummary(context, llm);
      } catch {
        context.aiSummary = generateHeuristicSummary(context);
      }
    } else {
      context.aiSummary = generateHeuristicSummary(context);
    }
    const repoName = toRepoName(repoUrl);
    let wikiStructure = "";
    let wikiContents = "";
    let deepWikiError: string | undefined;
    try {
      wikiStructure = await callDeepWikiTool("read_wiki_structure", { repoName });
      wikiContents = await callDeepWikiTool("read_wiki_contents", { repoName });
    } catch (error) {
      deepWikiError = error instanceof Error ? error.message : String(error);
    }
    const benchmark = compareAgainstDeepWiki(context, { repoName, wikiStructure, wikiContents, error: deepWikiError });
    return { context, benchmark };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function deepWikiAnalyzeFromUrl(repoUrl: string): Promise<any> {
  const repoName = toRepoName(repoUrl);
  const wikiStructure = await callDeepWikiTool("read_wiki_structure", { repoName });
  const wikiContents = await callDeepWikiTool("read_wiki_contents", { repoName });
  return {
    repoName,
    wikiStructure,
    wikiContents
  };
}

function toRepoName(repoUrl: string): string {
  const url = new URL(repoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid repo URL");
  }
  return `${parts[0]}/${parts[1]}`;
}

async function callDeepWikiTool(name: string, argumentsPayload: Record<string, any>): Promise<string> {
  const token = process.env.DEEPWIKI_TOKEN || process.env.DEVIN_API_KEY || "";
  const endpoint =
    process.env.DEEPWIKI_ENDPOINT ||
    (token ? "https://mcp.devin.ai/mcp" : "https://mcp.deepwiki.com/mcp");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-api-key"] = token;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: argumentsPayload
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const detail = body.slice(0, 500);
    const hint =
      response.status === 401 || response.status === 403
        ? " Check DEEPWIKI_TOKEN/DEVIN_API_KEY and use the authenticated endpoint."
        : "";
    throw new Error(`DeepWiki API error (${response.status}): ${response.statusText}. ${detail}${hint}`);
  }

  const text = await response.text();
  const result = parseDeepWikiResponse(text);
  if (!result) {
    throw new Error("DeepWiki response missing result");
  }
  return result;
}

function parseDeepWikiResponse(text: string): string {
  try {
    const json = JSON.parse(text) as { result?: unknown };
    const normalized = normalizeDeepWikiResult(json?.result);
    if (normalized) {
      return normalized;
    }
  } catch {
    // fall through to SSE parsing
  }

  const lines = text.split("\n");
  let lastResult = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload) as { result?: unknown };
      const normalized = normalizeDeepWikiResult(event?.result);
      if (normalized) {
        lastResult = normalized;
      }
    } catch {
      // ignore malformed events
    }
  }
  return lastResult;
}

function normalizeDeepWikiResult(result: unknown): string {
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result;
  }

  if (Array.isArray(result)) {
    return result.map((item) => normalizeDeepWikiResult(item)).filter(Boolean).join("\n\n");
  }

  if (typeof result === "object") {
    const value = result as {
      content?: unknown;
      structuredContent?: unknown;
      text?: unknown;
      result?: unknown;
      isError?: boolean;
    };

    if (typeof value.text === "string") {
      return value.text;
    }

    if (typeof value.result === "string") {
      return value.result;
    }

    if (Array.isArray(value.content)) {
      return value.content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const contentItem = item as { text?: unknown; content?: unknown };
            if (typeof contentItem.text === "string") return contentItem.text;
            if (typeof contentItem.content === "string") return contentItem.content;
            return JSON.stringify(item);
          }
          return String(item);
        })
        .join("\n\n");
    }

    if (value.structuredContent) {
      return typeof value.structuredContent === "string"
        ? value.structuredContent
        : JSON.stringify(value.structuredContent, null, 2);
    }

    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

export async function runEval(repoUrls: string[]): Promise<MultiRepoEvalResult> {
  const targets = repoUrls.length > 0 ? repoUrls : DEFAULT_BENCHMARK_REPOS;
  const repos: BenchmarkPayload[] = [];

  for (const repoUrl of targets) {
    const evaluated = await benchmarkRepoFromUrl(repoUrl);
    repos.push(evaluated);
  }

  const oursScores = repos.map((item) => item.benchmark.ourSystemScore);
  const deepScores = repos.map((item) => item.benchmark.deepWikiScore);
  const oursWins = repos.filter((item) => item.benchmark.winner === "ours").length;
  const deepWikiWins = repos.filter((item) => item.benchmark.winner === "deepwiki").length;
  const ties = repos.filter((item) => item.benchmark.winner === "tie").length;

  const mean = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return {
    evaluatedAt: new Date().toISOString(),
    repos,
    aggregate: {
      totalRepos: repos.length,
      oursAverage: mean(oursScores),
      deepWikiAverage: mean(deepScores),
      oursWins,
      deepWikiWins,
      ties
    }
  };
}
