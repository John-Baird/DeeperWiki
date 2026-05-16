import { useMemo, useState } from "react";
import { analyzeRepo, benchmarkRepo } from "./api";
import { AnalyzeResponse } from "./types";

const DEFAULT_REPO = "https://github.com/microsoft/Windows-driver-samples";

export default function App() {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const jsonText = useMemo(() => {
    return result ? JSON.stringify(result, null, 2) : "";
  }, [result]);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeRepo(repoUrl.trim());
      setResult(data);
    } catch (err) {
      setError("Analyze failed. Check the repo URL or server logs.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBenchmark() {
    setLoading(true);
    setError(null);
    try {
      const data = await benchmarkRepo(repoUrl.trim());
      setResult(data);
    } catch (err) {
      setError("Benchmark failed. Check the repo URL or server logs.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) {
      return;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "repo-context.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Repo Context System</p>
          <h1>Structured context for AI coding agents</h1>
          <p className="subhead">
            Analyze a GitHub repository, generate agent-ready context, and score it against a
            DeepWiki-style proxy.
          </p>
        </div>
      </header>

      <section className="panel">
        <label htmlFor="repo-url">Repository URL</label>
        <input
          id="repo-url"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/org/repo"
        />
        <div className="actions">
          <button onClick={handleAnalyze} disabled={loading}>
            {loading ? "Working..." : "Analyze"}
          </button>
          <button onClick={handleBenchmark} disabled={loading} className="secondary">
            {loading ? "Working..." : "Benchmark"}
          </button>
          <button onClick={handleDownload} disabled={!result} className="ghost">
            Download JSON
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Output</h2>
          {result?.benchmark ? (
            <span className="score">Score: {result.benchmark.coverageScore}</span>
          ) : null}
        </div>
        <pre className="output">{jsonText || "Run an analysis to see output."}</pre>
      </section>
    </div>
  );
}
