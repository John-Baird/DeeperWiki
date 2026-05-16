import { AnalyzeResponse, DeepWikiResponse, EvalResponse } from "./types";

const baseUrl = import.meta.env.VITE_API_BASE || "/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let details = "";
    try {
      const payload = await res.json();
      details = payload?.error || payload?.details || "";
    } catch {
      // keep default
    }
    throw new Error(details ? `Request failed: ${details}` : "Request failed");
  }

  return (await res.json()) as T;
}

export function analyzeRepo(repoUrl: string): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/analyze", { repoUrl });
}

export function benchmarkRepo(repoUrl: string): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/benchmark", { repoUrl });
}

export function deepWikiAnalyze(repoUrl: string): Promise<DeepWikiResponse> {
  return postJson<DeepWikiResponse>("/deepwiki", { repoUrl });
}

export function runDefaultEval(): Promise<EvalResponse> {
  return postJson<EvalResponse>("/eval", {});
}

export function runEval(repoUrls: string[]): Promise<EvalResponse> {
  return postJson<EvalResponse>("/eval", { repoUrls });
}
