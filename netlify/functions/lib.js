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

async function walkRepo(rootDir, maxFiles) {
  const stats = {
    totalFiles: 0,
    totalBytes: 0,
    languages: {},
    topLevelFolders: new Set(),
    keyFiles: new Set()
  };

  async function walk(current, depth) {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (stats.totalFiles >= maxFiles) {
        return;
      }

      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(rootDir, fullPath);

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

      const ext = path.extname(entry.name).toLowerCase();
      const lang = EXT_TO_LANG[ext] || "Other";
      stats.languages[lang] = (stats.languages[lang] || 0) + 1;

      if (KEY_FILES.includes(entry.name)) {
        stats.keyFiles.add(relPath);
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
  const candidates = ["README.md", "readme.md", "README.MD"];
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

  return {
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
  scoreAgainstProxy
};
