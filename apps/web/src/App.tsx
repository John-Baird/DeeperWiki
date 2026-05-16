import { useMemo, useState } from "react";
import { benchmarkRepo, runEval } from "./api";
import { AgentContext, BenchmarkResult, DeepWikiResponse, EvalResponse } from "./types";

const DEFAULT_REPO = "https://github.com/expressjs/express";

export default function App() {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [deepWiki, setDeepWiki] = useState<DeepWikiResponse["analysis"] | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [deepWikiNotice, setDeepWikiNotice] = useState<string | null>(null);
  const [defaultEval, setDefaultEval] = useState<EvalResponse | null>(null);
  const [multiRepoInput, setMultiRepoInput] = useState(
    "https://github.com/honojs/hono\nhttps://github.com/langchain-ai/langchain\nhttps://github.com/vercel/next.js"
  );

  function clearSingleResultState() {
    setContext(null);
    setBenchmark(null);
    setDeepWiki(null);
    setDeepWikiNotice(null);
  }

  function clearMultiResultState() {
    setDefaultEval(null);
  }

  const ourResponse = useMemo(() => {
    if (benchmark?.ourResponse) return benchmark.ourResponse;
    if (!context?.aiSummary) return "";
    const s = context.aiSummary;
    return [
      `Project Summary: ${s.projectSummary}`,
      `Architecture Map: ${s.architectureMap}`,
      `Conventions: ${s.conventions}`,
      `Key Files:`,
      ...s.keyFiles.map((item) => `- ${item.file}: ${item.reason}`)
    ].join("\n");
  }, [benchmark, context]);

  const deepWikiResponse = useMemo(() => {
    if (benchmark?.deepWikiResponse) return benchmark.deepWikiResponse;
    if (!deepWiki) return "";
    return `${deepWiki.wikiStructure}\n\n${deepWiki.wikiContents}`;
  }, [benchmark, deepWiki]);

  async function handleGenerateResponses() {
    setLoading(true);
    setError(null);
    clearSingleResultState();
    clearMultiResultState();
    try {
      const result = await benchmarkRepo(repoUrl.trim());
      setContext(result.context);
      setBenchmark(result.benchmark || null);
      setDeepWiki(result.benchmark?.deepWiki || null);
      if (result.benchmark?.deepWikiError) {
        setDeepWikiNotice(result.benchmark.deepWikiError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate responses.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMultiRepoBenchmark() {
    setLoading(true);
    setError(null);
    clearSingleResultState();
    clearMultiResultState();
    try {
      const repoUrls = multiRepoInput
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);

      if (repoUrls.length < 3) {
        throw new Error("Please provide at least 3 repository URLs.");
      }
      if (repoUrls.length > 10) {
        throw new Error("Please provide no more than 10 repository URLs.");
      }

      const result = await runEval(repoUrls);
      setDefaultEval(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Multi-repo benchmark failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="kicker">Context Arena</p>
          <h1>LLM vs DeepWiki</h1>
          <p className="subtitle">Split-screen compare, then benchmark across 5 criteria.</p>
        </div>
        {benchmark ? (
          <div className="final-score">
            <div>Final Score</div>
            <strong>{benchmark.ourSystemScore} vs {benchmark.deepWikiScore}</strong>
          </div>
        ) : null}
      </header>

      <section className="controls">
        <label htmlFor="repo-url">GitHub Repository URL</label>
        <input
          id="repo-url"
          value={repoUrl}
          onChange={(event) => setRepoUrl(event.target.value)}
          placeholder="https://github.com/org/repo"
        />
        <div className="actions">
          <button onClick={handleGenerateResponses} disabled={loading}>
            {loading ? "Running..." : "Scan single repo"}
          </button>
          <button onClick={handleMultiRepoBenchmark} disabled={loading} className="accent-alt">
            {loading ? "Running..." : "Run Multi-Repo Benchmark"}
          </button>
        </div>
        <label htmlFor="multi-repo-input">Multiple Repositories (one per line or comma-separated)</label>
        <textarea
          id="multi-repo-input"
          value={multiRepoInput}
          onChange={(event) => setMultiRepoInput(event.target.value)}
          placeholder="https://github.com/org/repo"
          rows={5}
        />
        {error ? <p className="error">{error}</p> : null}
        {deepWikiNotice ? (
          <p className="warning">DeepWiki unavailable right now: {deepWikiNotice}</p>
        ) : null}
      </section>

      <section className="split">
        <article className="response-panel">
          <h2>Your LLM Response</h2>
          <pre>{ourResponse || "Run Scan single repo to populate this panel."}</pre>
        </article>
        <article className="response-panel">
          <h2>DeepWiki LLM Response</h2>
          <pre>{deepWikiResponse || "Run Scan single repo to populate this panel."}</pre>
        </article>
      </section>

      <section className="benchmark-panel">
        <h2>Benchmark (5 Criteria)</h2>
        {defaultEval ? (
          <div className="default-eval">
            <h3>Default 3-Repo Benchmark Set</h3>
            <p>
              Ours avg: {defaultEval.aggregate.oursAverage} | DeepWiki avg: {defaultEval.aggregate.deepWikiAverage} |
              Wins: {defaultEval.aggregate.oursWins}/{defaultEval.aggregate.totalRepos}
            </p>
            <div className="default-eval-list">
              {defaultEval.repos.map((item) => (
                <div key={item.context.summary.repoUrl} className="default-eval-row">
                  <span>{item.context.summary.repoUrl}</span>
                  <span>Ours {item.benchmark.ourSystemScore}</span>
                  <span>DeepWiki {item.benchmark.deepWikiScore}</span>
                  <span>{item.benchmark.winner}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!benchmark ? (
          <p className="placeholder">Run Scan single repo to see scored comparison and evidence overlays.</p>
        ) : (
          <>
            <div className="single-score-row">
              <span>Yours: {benchmark.ourSystemScore}/100</span>
              <span>DeepWiki: {benchmark.deepWikiScore}/100</span>
              <span className={`winner ${benchmark.winner}`}>Winner: {benchmark.winner}</span>
            </div>
            <div className="criteria-grid">
              {benchmark.dimensions.map((dimension) => (
                <article key={dimension.name} className="criterion-card">
                  <header>
                    <h3>{dimension.name}</h3>
                    <p>{dimension.explanation}</p>
                  </header>
                  <div className="scores">
                    <span>Yours: {dimension.ourScore}/20</span>
                    <span>DeepWiki: {dimension.deepWikiScore}/20</span>
                    <span className={`winner ${dimension.winner}`}>Winner: {dimension.winner}</span>
                  </div>
                  <div className="overlay-grid">
                    <div className="overlay-side">
                      <h4>Your Evidence</h4>
                      <div className="overlay good">
                        {dimension.ourEvidence.good.map((item, idx) => (
                          <p key={`og-${idx}`}>{item}</p>
                        ))}
                      </div>
                      <div className="overlay bad">
                        {dimension.ourEvidence.bad.map((item, idx) => (
                          <p key={`ob-${idx}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                    <div className="overlay-side">
                      <h4>DeepWiki Evidence</h4>
                      <div className="overlay good">
                        {dimension.deepWikiEvidence.good.map((item, idx) => (
                          <p key={`dg-${idx}`}>{item}</p>
                        ))}
                      </div>
                      <div className="overlay bad">
                        {dimension.deepWikiEvidence.bad.map((item, idx) => (
                          <p key={`db-${idx}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
