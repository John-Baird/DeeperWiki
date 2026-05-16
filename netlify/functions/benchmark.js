const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const simpleGit = require("simple-git");
const { z } = require("zod");
const { analyzeRepo } = require("./lib");

const bodySchema = z.object({
  repoUrl: z.string().url()
});

function toRepoName(repoUrl) {
  const url = new URL(repoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid repo URL");
  return `${parts[0]}/${parts[1]}`;
}

const CRITERION_MAX = 20;

function clampScore(score) {
  return Math.max(0, Math.min(CRITERION_MAX, score));
}

function normalizeToCriterionScale(value, saturationPoint) {
  if (saturationPoint <= 0 || value <= 0) return 0;
  const normalized = 1 - Math.exp(-value / saturationPoint);
  return clampScore(Math.round(normalized * CRITERION_MAX));
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function splitSentences(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20);
}

function extractEvidence(text) {
  const lines = splitSentences(text);
  const good = lines
    .filter((line) => /\b(clear|concise|summary|overview|architecture|workflow|module|step|build|design|coverage|key files)\b/i.test(line))
    .slice(0, 3);
  const bad = lines
    .filter((line) => /\b(missing|unclear|unknown|none|not available|did not|no |incomplete|gap)\b/i.test(line))
    .slice(0, 3);
  if (good.length === 0) good.push("No specific criterion strength detected.");
  if (bad.length === 0) bad.push("No explicit criterion weakness detected.");
  return { good, bad };
}

function scoreReadability(text) {
  const length = text.length;
  const headings = countMatches(text, /^#{1,6}\s+/gm);
  const bullets = countMatches(text, /^\s*[-*]\s+/gm);
  const numbered = countMatches(text, /^\s*\d+\.\s+/gm);
  const sentenceCount = splitSentences(text).length;
  const structure = headings + bullets + numbered;
  if (length === 0) return 0;
  const structureScore = normalizeToCriterionScale(structure + Math.round(sentenceCount / 5), 7);
  const lengthScore =
    length <= 12000 ? 20 : length <= 22000 ? 16 : length <= 35000 ? 12 : length <= 55000 ? 8 : 4;
  return clampScore(Math.round((structureScore * 0.6) + (lengthScore * 0.4)));
}

function scoreWorkflowUnderstanding(text) {
  const treeSignals = countMatches(
    text,
    /\b(folder|directory|module|tree|structure|package|component|subsystem|layer|workspace|monorepo)\b/gi
  );
  const flowSignals = countMatches(
    text,
    /\b(flow|pipeline|request|startup|runtime|data flow|lifecycle|orchestration|sequence|execution)\b/gi
  );
  return clampScore(
    Math.round((normalizeToCriterionScale(treeSignals, 6) * 0.5) + (normalizeToCriterionScale(flowSignals, 6) * 0.5))
  );
}

function scoreContinuationReadiness(text) {
  const actionSignals = countMatches(
    text,
    /\b(run|build|test|deploy|next step|extend|add|implement|contribute|iterate|edit|refactor|debug|validate)\b/gi
  );
  const fileSignals = countMatches(
    text,
    /\b(readme|package\.json|src\/|apps\/|packages\/|api\/|web\/|docs\/|config|entry point)\b/gi
  );
  return clampScore(
    Math.round((normalizeToCriterionScale(actionSignals, 7) * 0.6) + (normalizeToCriterionScale(fileSignals, 5) * 0.4))
  );
}

function scoreDesignUnderstanding(text) {
  const designSignals = countMatches(
    text,
    /\b(architecture|design|pattern|layer|boundary|tradeoff|interface|abstraction|coupling|cohesion|rationale|decision)\b/gi
  );
  const systemSignals = countMatches(
    text,
    /\b(runtime|router|middleware|state|api|client|server|adapter|integration)\b/gi
  );
  return clampScore(
    Math.round((normalizeToCriterionScale(designSignals, 7) * 0.7) + (normalizeToCriterionScale(systemSignals, 6) * 0.3))
  );
}

function scoreCoverage(text) {
  const topicSignals = [
    /summary|overview|purpose/i,
    /architecture|module|component|structure/i,
    /convention|naming|error|test/i,
    /key files|important files|readme|package\.json|entry point/i,
    /run|build|deploy|workflow|pipeline/i
  ].reduce((sum, regex) => sum + (regex.test(text) ? 1 : 0), 0);

  const breadthSignals = countMatches(
    text,
    /\b(api|runtime|testing|build|deployment|dependency|integration|configuration|module|design)\b/gi
  );

  return clampScore(
    Math.round((normalizeToCriterionScale(topicSignals, 2.2) * 0.6) + (normalizeToCriterionScale(breadthSignals, 8) * 0.4))
  );
}

function extractEvidenceByCriterion(text, criterionName, goodPatterns, badPatterns, side) {
  const lines = splitSentences(text);
  const good = lines.filter((line) => goodPatterns.some((re) => re.test(line))).slice(0, 3);
  const bad = lines.filter((line) => badPatterns.some((re) => re.test(line))).slice(0, 3);
  const sideLabel = side === "ours" ? "your" : "DeepWiki";
  if (good.length === 0) good.push(`No specific ${criterionName.toLowerCase()} strength was detected in ${sideLabel} output.`);
  if (bad.length === 0) bad.push(`No explicit ${criterionName.toLowerCase()} weakness was detected in ${sideLabel} output.`);
  return { good, bad };
}

function buildDimension(name, explanation, ourResponse, deepWikiResponse, ourScore, deepWikiScore, goodPatterns, badPatterns) {
  return {
    name,
    explanation,
    ourScore,
    deepWikiScore,
    winner: ourScore === deepWikiScore ? "tie" : ourScore > deepWikiScore ? "ours" : "deepwiki",
    ourEvidence: extractEvidenceByCriterion(ourResponse, name, goodPatterns, badPatterns, "ours"),
    deepWikiEvidence: extractEvidenceByCriterion(deepWikiResponse, name, goodPatterns, badPatterns, "deepwiki")
  };
}

function callDeepWikiTool(name, argumentsPayload) {
  const token = process.env.DEEPWIKI_TOKEN || process.env.DEVIN_API_KEY || "";
  const endpoint =
    process.env.DEEPWIKI_ENDPOINT || (token ? "https://mcp.devin.ai/mcp" : "https://mcp.deepwiki.com/mcp");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-api-key"] = token;
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: argumentsPayload }
    })
  })
    .then(async (response) => {
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
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.result === "string") return parsed.result;
      } catch {
        // continue to SSE parse
      }
      const lines = text.split("\n");
      let last = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload);
          if (typeof event?.result === "string") last = event.result;
        } catch {}
      }
      return last || "";
    });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return { statusCode: 400, body: "Invalid repoUrl" };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();

  try {
    await git.clone(parsed.data.repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    const context = await analyzeRepo(parsed.data.repoUrl, tempDir);
    const ourResponse = [
      `Project Summary: ${context.aiSummary?.projectSummary || ""}`,
      `Architecture Map: ${context.aiSummary?.architectureMap || ""}`,
      `Conventions: ${context.aiSummary?.conventions || ""}`,
      `Key Files: ${(context.aiSummary?.keyFiles || []).map((k) => `${k.file}: ${k.reason}`).join(" | ")}`
    ].join("\n");

    const repoName = toRepoName(parsed.data.repoUrl);
    let wikiStructure = "";
    let wikiContents = "";
    let deepWikiError;
    try {
      wikiStructure = await callDeepWikiTool("read_wiki_structure", { repoName });
      wikiContents = await callDeepWikiTool("read_wiki_contents", { repoName });
    } catch (error) {
      deepWikiError = error instanceof Error ? error.message : String(error);
    }
    const deepWikiResponse = `${wikiStructure}\n\n${wikiContents}`;

    const readabilityGood = [/\b(concise|clear|summary|overview|quick|readable|organized|key files)\b/i];
    const readabilityBad = [/\b(verbose|wall of text|unclear|confusing|hard to read|missing summary)\b/i];
    const workflowGood = [/\b(tree|folder|directory|module|structure|data flow|lifecycle|pipeline|workflow)\b/i];
    const workflowBad = [/\b(no structure|unclear structure|missing flow|unknown module|not organized)\b/i];
    const continuationGood = [/\b(next step|build|run|test|deploy|implement|extend|contribute|entry point)\b/i];
    const continuationBad = [/\b(no instructions|missing run|missing test|cannot continue|no setup)\b/i];
    const designGood = [/\b(architecture|design|layer|boundary|pattern|tradeoff|rationale|interface)\b/i];
    const designBad = [/\b(no design|unclear design|missing architecture|unknown rationale)\b/i];
    const coverageGood = [/\b(summary|architecture|convention|key files|workflow|dependency|runtime)\b/i];
    const coverageBad = [/\b(missing|not covered|gap|incomplete|unknown|did not include)\b/i];

    const dimensions = [
      buildDimension("Readability", "How easy it is to scan and use quickly.", ourResponse, deepWikiResponse, scoreReadability(ourResponse), scoreReadability(deepWikiResponse), readabilityGood, readabilityBad),
      buildDimension("Workflow/Tree Understanding", "How well it explains project structure and execution flow.", ourResponse, deepWikiResponse, scoreWorkflowUnderstanding(ourResponse), scoreWorkflowUnderstanding(deepWikiResponse), workflowGood, workflowBad),
      buildDimension("Continuation Readiness", "How confidently a developer can continue building from this context.", ourResponse, deepWikiResponse, scoreContinuationReadiness(ourResponse), scoreContinuationReadiness(deepWikiResponse), continuationGood, continuationBad),
      buildDimension("Design Understanding", "How well architecture/design rationale is explained.", ourResponse, deepWikiResponse, scoreDesignUnderstanding(ourResponse), scoreDesignUnderstanding(deepWikiResponse), designGood, designBad),
      buildDimension("Coverage Completeness", "How fully the important areas are covered.", ourResponse, deepWikiResponse, scoreCoverage(ourResponse), scoreCoverage(deepWikiResponse), coverageGood, coverageBad)
    ];

    const ourSystemScore = Math.max(0, Math.min(100, dimensions.reduce((acc, d) => acc + d.ourScore, 0)));
    const deepWikiScore = Math.max(0, Math.min(100, dimensions.reduce((acc, d) => acc + d.deepWikiScore, 0)));
    const winner = ourSystemScore === deepWikiScore ? "tie" : ourSystemScore > deepWikiScore ? "ours" : "deepwiki";

    const benchmark = {
      repoUrl: parsed.data.repoUrl,
      evaluatedAt: new Date().toISOString(),
      ourSystemScore,
      deepWikiScore,
      winner,
      dimensions,
      notes: ["Criteria scored on a 0-20 scale, summed to a 0-100 total.", `Winner: ${winner}.`],
      ourResponse,
      deepWikiResponse,
      deepWiki: { repoName, wikiStructure, wikiContents },
      deepWikiError
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, benchmark })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Benchmark failed", details: error instanceof Error ? error.message : String(error) })
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
