import { AgentContext, BenchmarkResult, DeepWikiProxy } from "./types";

const REQUIRED_SECTIONS: Array<keyof DeepWikiProxy> = [
  "overview",
  "architecture",
  "buildAndRun",
  "apiSurface",
  "testing"
];

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

  return {
    overview,
    architecture,
    buildAndRun,
    apiSurface,
    testing
  };
}

export function scoreAgainstProxy(proxy: DeepWikiProxy, context: AgentContext): BenchmarkResult {
  let score = 0;
  const notes: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (proxy[section] && proxy[section].trim().length > 20) {
      score += 15;
    } else {
      notes.push(`Section ${section} is thin or empty.`);
    }
  }

  if (context.readmeExcerpt) {
    score += 10;
  } else {
    notes.push("README excerpt missing.");
  }

  if (context.structure.keyFiles.length > 0) {
    score += 10;
  }

  if (context.structure.packageScripts.dev) {
    score += 5;
  }

  if (score > 100) {
    score = 100;
  }

  if (notes.length === 0) {
    notes.push("Proxy coverage looks healthy.");
  }

  return {
    deepWikiProxy: proxy,
    coverageScore: score,
    notes
  };
}
