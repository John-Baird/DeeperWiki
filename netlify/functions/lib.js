const fs = require("fs/promises");
const path = require("path");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  ".idea"
]);

const EXT_TO_LANG = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".json": "JSON",
  ".md": "Markdown",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".rb": "Ruby",
  ".php": "PHP"
};

const KEY_FILES = [
  "README.md",
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle"
];

const SOURCE_PRIORITY_DIRS = ["src", "lib", "app", "server", "core", "router", "middleware", "test", "tests"];

async function walkRepo(rootDir, maxFiles) {
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    languages: {},
    topLevelFolders: new Set(),
    topLevelFiles: new Set(),
    keyFiles: new Set(),
    topFolderFileCounts: {},
    representativeSourceFiles: [],
    representativeTestFiles: []
  };

  async function walk(current, depth) {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (stats.totalFiles >= maxFiles) {
        return;
      }

      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(rootDir, fullPath);
      const normalizedRelPath = relPath.replace(/\\/g, "/");
      const topSegment = normalizedRelPath.split("/")[0] || "";

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        if (depth === 0) {
          stats.topLevelFolders.add(entry.name);
        }
        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      stats.totalFiles += 1;

      if (depth === 0) {
        stats.topLevelFiles.add(entry.name);
      }
      if (topSegment) {
        stats.topFolderFileCounts[topSegment] = (stats.topFolderFileCounts[topSegment] || 0) + 1;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const lang = EXT_TO_LANG[ext] || "Other";
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;

      if (KEY_FILES.includes(entry.name)) {
        stats.keyFiles.add(normalizedRelPath);
      }

      const isSourceLike = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".kt", ".cs"].includes(ext);
      const isTestLike = /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/i.test(normalizedRelPath) ||
        /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs|java|kt|cs)$/i.test(normalizedRelPath);

      if (isSourceLike && stats.representativeSourceFiles.length < 20) {
        const priorityBoost = SOURCE_PRIORITY_DIRS.some((dir) => normalizedRelPath.startsWith(`${dir}/`));
        if (priorityBoost || normalizedRelPath.split("/").length <= 3) {
          stats.representativeSourceFiles.push(normalizedRelPath);
        }
      }

      if (isTestLike && stats.representativeTestFiles.length < 12) {
        stats.representativeTestFiles.push(normalizedRelPath);
      }

      try {
        const fileStats = await fs.stat(fullPath);
        stats.totalBytes += fileStats.size;
      } catch {
        // ignore size errors
      }
    }
  }

  await walk(rootDir, 0);
  return stats;
}

async function readTextFile(filePath, maxChars) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.slice(0, maxChars).trim();
  } catch {
    return "";
  }
}

async function findReadme(repoDir) {
  const candidates = ["README.md", "Readme.md", "readme.md", "README.MD", "README.rst", "README.txt"];
  for (const name of candidates) {
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

async function readPackageJson(repoDir) {
  try {
    const content = await fs.readFile(path.join(repoDir, "package.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function buildTechHints(languages, deps) {
  const hints = [];

  if (languages.TypeScript) {
    hints.push("TypeScript codebase");
  }
  if (languages.Python) {
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

function buildSetupHints(scripts, entry) {
  const hints = [];

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

function buildRiskHints(totalFiles, totalBytes, depCount) {
  const risks = [];

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

function extractReadmeSummary(readmeExcerpt) {
  if (!readmeExcerpt) return "Repository summary unavailable.";
  const cleanLine = readmeExcerpt
    .split("\n")
    .map((line) =>
      line
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[[^\]]+]\(([^)]+)\)/g, "$1")
        .replace(/[`#>*_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .find((line) => line.length > 40 && !/^https?:\/\//i.test(line));
  return cleanLine || "Repository summary unavailable.";
}

function inferFolderRole(folderName) {
  const name = folderName.toLowerCase();
  if (name.includes("src") || name.includes("lib")) return "core implementation";
  if (name.includes("test")) return "testing and validation";
  if (name.includes("docs") || name.includes("example")) return "documentation and usage examples";
  if (name.includes(".github") || name.includes("ci")) return "automation and CI workflows";
  if (name.includes("bench")) return "performance benchmarking";
  return "project subsystem";
}

function pickKeyFiles(context) {
  const fromKeyFiles = [...context.structure.keyFiles];
  const sourceCandidates = (context.structure.representativeSourceFiles || [])
    .filter((file) => !file.includes("node_modules"))
    .slice(0, 4);
  const testCandidates = (context.structure.representativeTestFiles || []).slice(0, 2);

  const merged = [...fromKeyFiles, ...sourceCandidates, ...testCandidates];
  const unique = Array.from(new Set(merged)).slice(0, 8);
  return unique.length ? unique : ["README.md", "package.json"];
}

function buildAiSummaryHeuristic(context) {
  const topLanguages = Object.entries(context.summary.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang)
    .join(", ");

  const folderRoles = context.structure.topLevelFolders
    .slice(0, 8)
    .map((folder) => `${folder} (${inferFolderRole(folder)})`)
    .join(", ");
  const folderFlow = context.structure.topLevelFolders.slice(0, 6).join(" -> ");
  const scripts = Object.keys(context.structure.packageScripts || {});
  const keyFiles = pickKeyFiles(context);
  const readmeSummary = extractReadmeSummary(context.readmeExcerpt);

  return {
    projectSummary: `${readmeSummary} Stack hints: ${context.techStackHints.join(", ")}. Primary languages: ${topLanguages}. The repository is organized for implementation, validation, and examples across ${context.summary.totalFiles} files.`,
    architectureMap: `Top-level modules and intent: ${folderRoles || "not detected"}. Typical contributor workflow is ${folderFlow || "README -> source -> tests"}. Build/test execution is driven by scripts: ${scripts.join(", ") || "none detected"}.`,
    conventions: `Conventions inferred from codebase signals: naming follows ecosystem defaults for ${topLanguages}; error handling favors explicit checks and middleware-style control paths; tests appear in ${(context.structure.representativeTestFiles || []).slice(0, 3).join(", ") || "dedicated test folders"}. Continuation path: start from ${keyFiles[0]}, then ${keyFiles[1] || "core source"}, validate with ${context.structure.packageScripts.test || "project test workflow"}. Risks: ${context.risks.join("; ")}.`,
    keyFiles: keyFiles.map((file) => ({
      file,
      reason: file.endsWith("README.md") || file === "README.md"
        ? "Primary onboarding and feature map for understanding project scope and usage."
        : file.includes("test")
          ? "High-leverage test coverage entry point for safe iteration."
          : "Core implementation file likely to be edited for feature work."
    }))
  };
}

function mergeSummary(generated, fallback) {
  const safeGenerated = generated || {};
  const keyFiles = Array.isArray(safeGenerated.keyFiles) && safeGenerated.keyFiles.length
    ? safeGenerated.keyFiles
    : fallback.keyFiles;

  return {
    projectSummary:
      typeof safeGenerated.projectSummary === "string" && safeGenerated.projectSummary.trim().length > 80
        ? sanitizeSummaryText(safeGenerated.projectSummary)
        : fallback.projectSummary,
    architectureMap:
      typeof safeGenerated.architectureMap === "string" && safeGenerated.architectureMap.trim().length > 120
        ? sanitizeSummaryText(safeGenerated.architectureMap)
        : fallback.architectureMap,
    conventions:
      typeof safeGenerated.conventions === "string" && safeGenerated.conventions.trim().length > 120
        ? sanitizeSummaryText(safeGenerated.conventions)
        : fallback.conventions,
    keyFiles: keyFiles
      .map((item) => ({
        file: String(item?.file || ""),
        reason: String(item?.reason || "")
      }))
      .filter((item) => item.file)
      .slice(0, 8)
  };
}

function sanitizeSummaryText(text) {
  if (!text) return "";
  return String(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\[[^\]]+:\d+(?:-\d+)?\]\(\)/g, "")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    .replace(/mermaid/gi, "")
    .replace(/<details>[\s\S]*?<\/details>/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function buildAiSummaryWithLLM(context) {
  const apiKey = process.env.LLM_API_KEY;
  const fallback = buildAiSummaryHeuristic(context);
  if (!apiKey) {
    return fallback;
  }

  const model = process.env.LLM_MODEL || "gpt-5-mini";
  const prompt = `Create a high-signal JSON summary for an AI coding agent and a new contributor.

You are being scored on 5 criteria:
1) Readability
2) Workflow/tree understanding
3) Continuation readiness
4) Design understanding
5) Coverage completeness

Use concrete repository details from this context:
Repo URL: ${context.summary.repoUrl}
Languages: ${Object.keys(context.summary.languages).join(", ")}
Top-level folders: ${context.structure.topLevelFolders.join(", ")}
Key files: ${context.structure.keyFiles.join(", ")}
Scripts: ${Object.keys(context.structure.packageScripts).join(", ")}
Setup hints: ${context.setupHints.join("; ")}
Risks: ${context.risks.join("; ")}
README excerpt: ${context.readmeExcerpt.slice(0, 1200)}

Return strict JSON:
{
  "projectSummary": "2-4 practical sentences with concrete repo details and stack",
  "architectureMap": "4-7 practical sentences explaining module tree, high-level relationships, and developer workflow",
  "conventions": "4-7 practical sentences explaining naming/error-handling/testing conventions and concrete continuation guidance",
  "keyFiles": [{"file":"...","reason":"..."}]
}

Hard requirements:
- Mention at least 5 concrete file/folder names from this repo.
- Include at least one explicit practical flow: setup -> edit -> validate.
- Include specific next steps for a contributor.
- Avoid generic phrases like "mixed technology stack" unless truly unknown.
- Keep it understandable for an engineer onboarding quickly.

Do NOT include:
- code blocks
- Mermaid or diagram syntax
- line-by-line code internals
- giant API/member tables
- file:line citations
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 1800
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const jsonText = content.startsWith("```")
      ? content
          .split("```")
          .filter((s) => s && !s.startsWith("json"))
          .join("")
          .trim()
      : content.trim();

    const parsed = JSON.parse(jsonText);
    const keyFiles = Array.isArray(parsed?.keyFiles)
      ? parsed.keyFiles
          .map((item) => ({
            file: String(item?.file || ""),
            reason: String(item?.reason || "")
          }))
          .filter((item) => item.file)
      : [];

    return mergeSummary({
      projectSummary: String(parsed?.projectSummary || ""),
      architectureMap: String(parsed?.architectureMap || ""),
      conventions: String(parsed?.conventions || ""),
      keyFiles: keyFiles.length ? keyFiles : fallback.keyFiles
    }, fallback);
  } catch {
    return fallback;
  }
}

async function analyzeRepo(repoUrl, repoDir) {
  const stats = await walkRepo(repoDir, 4000);
  const readmePath = await findReadme(repoDir);
  const readmeExcerpt = readmePath ? await readTextFile(readmePath, 2000) : "";

  const pkg = await readPackageJson(repoDir);
  const dependencies = Object.keys((pkg && pkg.dependencies) || {});
  const devDependencies = Object.keys((pkg && pkg.devDependencies) || {});
  const packageScripts = (pkg && pkg.scripts) || {};

  const techStackHints = buildTechHints(stats.languages, dependencies);
  const setupHints = buildSetupHints(packageScripts, pkg && pkg.main);
  const risks = buildRiskHints(stats.totalFiles, stats.totalBytes, dependencies.length);

  const context = {
    summary: {
      repoUrl,
      analyzedAt: new Date().toISOString(),
      totalFiles: stats.totalFiles,
      totalBytes: stats.totalBytes,
      languages: stats.languages
    },
    readmeExcerpt,
    structure: {
      topLevelFolders: Array.from(stats.topLevelFolders).sort(),
      topLevelFiles: Array.from(stats.topLevelFiles).sort(),
      keyFiles: Array.from(stats.keyFiles).sort(),
      representativeSourceFiles: stats.representativeSourceFiles,
      representativeTestFiles: stats.representativeTestFiles,
      packageScripts,
      dependencies,
      devDependencies
    },
    techStackHints,
    setupHints,
    risks
  };

  context.aiSummary = await buildAiSummaryWithLLM(context);
  return context;
}

function generateDeepWikiProxy(context) {
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

function scoreAgainstProxy(proxy, context) {
  let score = 0;
  const notes = [];
  const sections = ["overview", "architecture", "buildAndRun", "apiSurface", "testing"];

  for (const section of sections) {
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

module.exports = {
  analyzeRepo,
  generateDeepWikiProxy,
  scoreAgainstProxy,
  buildAiSummary: buildAiSummaryHeuristic
};
