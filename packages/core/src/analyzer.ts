import fs from "fs/promises";
import path from "path";
import { AgentContext } from "./types";
import { readTextFile, walkRepo } from "./utils";

const MAX_FILES = 4000;
const README_NAMES = ["README.md", "readme.md", "README.MD"];

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
};

export async function analyzeRepo(repoUrl: string, repoDir: string, defaultBranch?: string): Promise<AgentContext> {
  const stats = await walkRepo(repoDir, MAX_FILES);

  const readmePath = await findReadme(repoDir);
  const readmeExcerpt = readmePath ? await readTextFile(readmePath, 2000) : "";

  const packageJsonPath = path.join(repoDir, "package.json");
  const pkg = await readPackageJson(packageJsonPath);

  const dependencies = Object.keys(pkg?.dependencies || {});
  const devDependencies = Object.keys(pkg?.devDependencies || {});
  const packageScripts = pkg?.scripts || {};

  const techStackHints = buildTechHints(stats.languages, dependencies);
  const setupHints = buildSetupHints(packageScripts, pkg?.main);
  const risks = buildRiskHints(stats.totalFiles, stats.totalBytes, dependencies.length);

  return {
    summary: {
      repoUrl,
      analyzedAt: new Date().toISOString(),
      defaultBranch,
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      languages: stats.languages
    },
    readmeExcerpt,
    structure: {
      topLevelFolders: Array.from(stats.topLevelFolders).sort(),
      keyFiles: Array.from(stats.keyFiles).sort(),
      packageScripts,
      dependencies,
      devDependencies
    },
    techStackHints,
    setupHints,
    risks
  };
}

async function findReadme(repoDir: string): Promise<string | null> {
  for (const name of README_NAMES) {
    const candidate = path.join(repoDir, name);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

function buildTechHints(languages: Record<string, number>, deps: string[]): string[] {
  const hints: string[] = [];

  if (languages["TypeScript"]) {
    hints.push("TypeScript codebase");
  }
  if (languages["Python"]) {
    hints.push("Python modules present");
  }
  if (deps.includes("react")) {
    hints.push("React UI");
  }
  if (deps.includes("express")) {
    hints.push("Express server");
  }
  if (deps.includes("next")) {
    hints.push("Next.js app");
  }

  if (hints.length === 0) {
    hints.push("Mixed technology stack");
  }

  return hints;
}

function buildSetupHints(scripts: Record<string, string>, entry?: string): string[] {
  const hints: string[] = [];

  if (scripts.install) {
    hints.push("Run npm install");
  }
  if (scripts.dev) {
    hints.push("Run npm run dev");
  }
  if (scripts.build) {
    hints.push("Run npm run build");
  }
  if (scripts.test) {
    hints.push("Run npm test");
  }
  if (entry) {
    hints.push(`Entry point: ${entry}`);
  }

  if (hints.length === 0) {
    hints.push("Check project README for setup instructions");
  }

  return hints;
}

function buildRiskHints(totalFiles: number, totalBytes: number, depCount: number): string[] {
  const risks: string[] = [];

  if (totalFiles > 2000) {
    risks.push("Large repository, consider scoping analysis to a module");
  }
  if (totalBytes > 150000000) {
    risks.push("Large repo size may exceed analysis limits");
  }
  if (depCount === 0) {
    risks.push("No package.json dependencies detected");
  }

  if (risks.length === 0) {
    risks.push("No obvious risk flags detected");
  }

  return risks;
}
