import { AgentContext, BenchmarkDimension, BenchmarkResult, DeepWikiProxy } from "./types";

type DeepWikiInput = {
  repoName: string;
  wikiStructure: string;
  wikiContents: string;
  error?: string;
};

const REQUIRED_SECTIONS: Array<keyof DeepWikiProxy> = [
  "overview",
  "architecture",
  "buildAndRun",
  "apiSurface",
  "testing"
];

const CRITERION_MAX = 20;

function clampScore(score: number): number {
  return Math.max(0, Math.min(CRITERION_MAX, score));
}

function normalizeToCriterionScale(value: number, saturationPoint: number): number {
  if (saturationPoint <= 0 || value <= 0) return 0;
  const normalized = 1 - Math.exp(-value / saturationPoint);
  return clampScore(Math.round(normalized * CRITERION_MAX));
}

function toOurResponse(context: AgentContext): string {
  const summary = context.aiSummary;
  if (!summary) return "";
  const keyFiles = summary.keyFiles.map((item) => `${item.file}: ${item.reason}`).join("\n");
  return [
    `Project Summary: ${summary.projectSummary}`,
    `Architecture Map: ${summary.architectureMap}`,
    `Conventions: ${summary.conventions}`,
    `Key Files:\n${keyFiles}`
  ].join("\n\n");
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20);
}

function extractEvidence(text: string, goodPatterns: RegExp[], badPatterns: RegExp[]): { good: string[]; bad: string[] } {
  const lines = splitSentences(text);
  const good: string[] = [];
  const bad: string[] = [];

  for (const line of lines) {
    if (good.length < 3 && goodPatterns.some((pattern) => pattern.test(line))) {
      good.push(line);
    } else if (bad.length < 3 && badPatterns.some((pattern) => pattern.test(line))) {
      bad.push(line);
    }
    if (good.length >= 3 && bad.length >= 3) break;
  }

  if (good.length === 0) {
    good.push("No strong positive evidence was detected for this criterion.");
  }
  if (bad.length === 0) {
    bad.push("No major weakness detected for this criterion.");
  }

  return { good, bad };
}

function extractEvidenceForCriterion(
  text: string,
  criterionName: string,
  goodPatterns: RegExp[],
  badPatterns: RegExp[],
  side: "ours" | "deepwiki"
): { good: string[]; bad: string[] } {
  const evidence = extractEvidence(text, goodPatterns, badPatterns);
  const sideLabel = side === "ours" ? "your" : "DeepWiki";

  if (evidence.good[0] === "No strong positive evidence was detected for this criterion.") {
    evidence.good[0] = `No specific ${criterionName.toLowerCase()} strength was detected in ${sideLabel} output.`;
  }
  if (evidence.bad[0] === "No major weakness detected for this criterion.") {
    evidence.bad[0] = `No explicit ${criterionName.toLowerCase()} weakness was detected in ${sideLabel} output.`;
  }

  return evidence;
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function scoreReadability(text: string): number {
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

function scoreWorkflowUnderstanding(text: string): number {
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

function scoreContinuationReadiness(text: string): number {
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

function scoreDesignUnderstanding(text: string): number {
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

function scoreCoverage(text: string): number {
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

function buildDimension(
  name: string,
  ourResponse: string,
  deepWikiResponse: string,
  ourScore: number,
  deepWikiScore: number,
  explanation: string,
  goodPatterns: RegExp[],
  badPatterns: RegExp[]
): BenchmarkDimension {
  return {
    name,
    ourScore,
    deepWikiScore,
    winner: ourScore === deepWikiScore ? "tie" : ourScore > deepWikiScore ? "ours" : "deepwiki",
    explanation,
    ourEvidence: extractEvidenceForCriterion(ourResponse, name, goodPatterns, badPatterns, "ours"),
    deepWikiEvidence: extractEvidenceForCriterion(deepWikiResponse, name, goodPatterns, badPatterns, "deepwiki")
  };
}

function scoreOverall(dimensions: BenchmarkDimension[]): number {
  const raw = dimensions.reduce((sum, item) => sum + item.ourScore, 0);
  return Math.min(100, Math.max(0, raw));
}

function scoreDeepWikiOverall(dimensions: BenchmarkDimension[]): number {
  const raw = dimensions.reduce((sum, item) => sum + item.deepWikiScore, 0);
  return Math.min(100, Math.max(0, raw));
}

export function generateDeepWikiProxy(context: AgentContext): DeepWikiProxy {
  const overview = context.readmeExcerpt
    ? context.readmeExcerpt.split("\n").slice(0, 8).join(" ")
    : "No README excerpt available.";

  const architecture = context.structure.topLevelFolders.length
    ? `Top-level folders: ${context.structure.topLevelFolders.join(", ")}.`
    : "No folders detected.";

  const buildAndRun = context.setupHints.join(" ");
  const apiSurface = context.structure.keyFiles.length
    ? `Key files: ${context.structure.keyFiles.join(", ")}.`
    : "No key files detected.";
  const testing = context.structure.packageScripts.test
    ? `Test command: ${context.structure.packageScripts.test}.`
    : "No test script detected.";

  return { overview, architecture, buildAndRun, apiSurface, testing };
}

export function scoreAgainstProxy(proxy: DeepWikiProxy, context: AgentContext): BenchmarkResult {
  let score = 0;
  const notes: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (proxy[section] && proxy[section].trim().length > 20) score += 15;
    else notes.push(`Section ${section} is thin or empty.`);
  }
  if (context.readmeExcerpt) score += 10;
  else notes.push("README excerpt missing.");
  if (context.structure.keyFiles.length > 0) score += 10;
  if (context.structure.packageScripts.dev) score += 5;
  if (score > 100) score = 100;
  if (notes.length === 0) notes.push("Proxy coverage looks healthy.");

  return {
    repoUrl: context.summary.repoUrl,
    evaluatedAt: new Date().toISOString(),
    ourSystemScore: score,
    deepWikiScore: 0,
    winner: "ours",
    dimensions: [],
    notes,
    ourResponse: toOurResponse(context),
    deepWikiResponse: "",
    deepWiki: { repoName: "proxy", wikiStructure: "", wikiContents: "" },
    legacyProxy: proxy
  };
}

export function compareAgainstDeepWiki(context: AgentContext, deepWiki: DeepWikiInput): BenchmarkResult {
  const ourResponse = toOurResponse(context);
  const deepWikiResponse = `${deepWiki.wikiStructure}\n\n${deepWiki.wikiContents}`;

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

  const dimensions: BenchmarkDimension[] = [
    buildDimension(
      "Readability",
      ourResponse,
      deepWikiResponse,
      scoreReadability(ourResponse),
      scoreReadability(deepWikiResponse),
      "How easy it is to scan and use quickly.",
      readabilityGood,
      readabilityBad
    ),
    buildDimension(
      "Workflow/Tree Understanding",
      ourResponse,
      deepWikiResponse,
      scoreWorkflowUnderstanding(ourResponse),
      scoreWorkflowUnderstanding(deepWikiResponse),
      "How well it explains project structure and execution flow.",
      workflowGood,
      workflowBad
    ),
    buildDimension(
      "Continuation Readiness",
      ourResponse,
      deepWikiResponse,
      scoreContinuationReadiness(ourResponse),
      scoreContinuationReadiness(deepWikiResponse),
      "How confidently a developer can continue building from this context.",
      continuationGood,
      continuationBad
    ),
    buildDimension(
      "Design Understanding",
      ourResponse,
      deepWikiResponse,
      scoreDesignUnderstanding(ourResponse),
      scoreDesignUnderstanding(deepWikiResponse),
      "How well architecture/design rationale is explained.",
      designGood,
      designBad
    ),
    buildDimension(
      "Coverage Completeness",
      ourResponse,
      deepWikiResponse,
      scoreCoverage(ourResponse),
      scoreCoverage(deepWikiResponse),
      "How fully the important areas are covered.",
      coverageGood,
      coverageBad
    )
  ];

  const ourSystemScore = scoreOverall(dimensions);
  const deepWikiScore = scoreDeepWikiOverall(dimensions);
  const winner = ourSystemScore === deepWikiScore ? "tie" : ourSystemScore > deepWikiScore ? "ours" : "deepwiki";
  const notes = [
    `Criteria scored on a 0-20 scale, summed to a 0-100 total.`,
    `Winner: ${winner}.`
  ];
  if (deepWiki.error) {
    notes.push("DeepWiki was partially unavailable; score used available output only.");
  }

  return {
    repoUrl: context.summary.repoUrl,
    evaluatedAt: new Date().toISOString(),
    ourSystemScore,
    deepWikiScore,
    winner,
    dimensions,
    notes,
    ourResponse,
    deepWikiResponse,
    deepWiki: {
      repoName: deepWiki.repoName,
      wikiStructure: deepWiki.wikiStructure,
      wikiContents: deepWiki.wikiContents
    },
    deepWikiError: deepWiki.error
  };
}
