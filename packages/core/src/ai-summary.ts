import { AgentContext, AISummary } from "./types";
import { LLMProvider } from "./llm";

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(" ");
  if (value && typeof value === "object") {
    const text = Object.values(value as Record<string, unknown>)
      .map((item) => toText(item))
      .filter((item) => item.trim().length > 0)
      .join(" ");
    return text || JSON.stringify(value);
  }
  return value ? String(value) : "";
}

function normalizeSummary(raw: any): AISummary {
  return {
    projectSummary: toText(raw?.projectSummary),
    architectureMap: toText(raw?.architectureMap),
    conventions: toText(raw?.conventions),
    keyFiles: Array.isArray(raw?.keyFiles)
      ? raw.keyFiles.map((item: any) => ({
          file: String(item?.file || ""),
          reason: toText(item?.reason)
        }))
      : []
  };
}

function mergeWithHeuristic(generated: AISummary, heuristic: AISummary): AISummary {
  const projectSummary =
    generated.projectSummary.trim().length >= 140
      ? generated.projectSummary
      : `${generated.projectSummary} ${heuristic.projectSummary}`.trim();

  const architectureMap =
    generated.architectureMap.trim().length >= 220
      ? generated.architectureMap
      : `${generated.architectureMap} ${heuristic.architectureMap}`.trim();

  const conventions =
    generated.conventions.trim().length >= 220
      ? generated.conventions
      : `${generated.conventions} ${heuristic.conventions}`.trim();

  const keyFileMap = new Map<string, string>();
  for (const item of generated.keyFiles) {
    if (item.file.trim()) keyFileMap.set(item.file, item.reason || "High-signal file for implementation work.");
  }
  for (const item of heuristic.keyFiles) {
    if (item.file.trim() && !keyFileMap.has(item.file)) {
      keyFileMap.set(item.file, item.reason || "High-signal file for implementation work.");
    }
  }

  const keyFiles = Array.from(keyFileMap.entries())
    .slice(0, 8)
    .map(([file, reason]) => ({ file, reason }));

  return { projectSummary, architectureMap, conventions, keyFiles };
}

export async function generateAISummary(
  context: AgentContext,
  llm: LLMProvider
): Promise<AISummary> {
  const prompt = `Create a high-signal JSON summary for an AI coding agent.

You are being scored on 5 criteria:
1) Readability
2) Workflow/tree understanding
3) Continuation readiness (how to keep building)
4) Design understanding
5) Coverage completeness

Output requirements:
- Use concrete repository details, not generic statements.
- Mention specific top-level folders/modules.
- Include at least one execution flow or pipeline description.
- Include concrete continuation hints (where to start, what to run, what to edit next).
- Include design rationale and tradeoff patterns when inferable.
- Keep each text field dense but scannable.

Context:
Repo URL: ${context.summary.repoUrl}
Languages: ${Object.keys(context.summary.languages).join(", ")}
Top-level folders: ${context.structure.topLevelFolders.join(", ")}
Key files: ${context.structure.keyFiles.join(", ")}
Package scripts: ${Object.keys(context.structure.packageScripts).join(", ")}
Setup hints: ${context.setupHints.join("; ")}
Risk hints: ${context.risks.join("; ")}
Dependencies: ${context.structure.dependencies.join(", ")}
Dev dependencies: ${context.structure.devDependencies.join(", ")}
README excerpt: ${context.readmeExcerpt.slice(0, 1200)}

Respond with JSON:
{
  "projectSummary": "2-4 sentences: what this project is, stack, scope, and intended use.",
  "architectureMap": "3-8 sentences covering structure tree, module relationships, and runtime/build/request flow.",
  "conventions": "3-8 sentences covering naming/error handling/testing patterns + practical continuation guidance for next implementation steps.",
  "keyFiles": [
    {"file": "path", "reason": "specific reason tied to onboarding, architecture, or implementation flow"}
  ]
}

Hard constraints:
- Return 6-8 keyFiles when possible.
- Prefer paths that a contributor would actually edit first.
- Do not use markdown code fences.
`;

  const raw = await llm.generateStructured<AISummary>(prompt);
  const normalized = normalizeSummary(raw);
  return mergeWithHeuristic(normalized, generateHeuristicSummary(context));
}

function topLanguages(languages: Record<string, number>): string {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)
    .join(", ");
}

function shortReadmeSentence(readmeExcerpt: string): string {
  const line = readmeExcerpt
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 40 && !item.startsWith("#"));
  return line || "README did not contain a clear one-line project description.";
}

export function generateHeuristicSummary(context: AgentContext): AISummary {
  const stacks = context.techStackHints.join(", ");
  const folders = context.structure.topLevelFolders.slice(0, 8).join(", ") || "No top-level folders detected";
  const keyFiles = context.structure.keyFiles.slice(0, 6);

  return {
    projectSummary: `${shortReadmeSentence(context.readmeExcerpt)} Stack hints: ${stacks}. Primary languages: ${topLanguages(context.summary.languages)}.`,
    architectureMap: `Repository is organized around: ${folders}. Setup and runtime are primarily driven by scripts: ${Object.keys(context.structure.packageScripts).join(", ") || "none"}.`,
    conventions: `Conventions inferred from tooling and structure: naming conventions align to repository language standards; error handling favors explicit checks and safe fallbacks; testing patterns are reflected in available scripts and docs. Setup signals: ${context.setupHints.join("; ")}. Risk checks: ${context.risks.join("; ")}.`,
    keyFiles: keyFiles.length
      ? keyFiles.map((file) => ({
          file,
          reason: "High-signal entry point for understanding setup, dependencies, or project behavior."
        }))
      : [
          {
            file: "README.md",
            reason: "Primary onboarding surface when no explicit key files were detected."
          }
        ]
  };
}
