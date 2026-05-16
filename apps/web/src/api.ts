import { AnalyzeResponse } from "./types";

const baseUrl = import.meta.env.VITE_API_BASE || "/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("Request failed");
  }

  return (await res.json()) as T;
}

export function analyzeRepo(repoUrl: string): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/analyze", { repoUrl });
}

export function benchmarkRepo(repoUrl: string): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/benchmark", { repoUrl });
}
