import fs from "fs/promises";
import path from "path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  ".idea"
]);

export type WalkStats = {
  totalFiles: number;
  totalBytes: number;
  languages: Record<string, number>;
  topLevelFolders: Set<string>;
  keyFiles: Set<string>;
  files: string[];
};

const EXT_TO_LANG: Record<string, string> = {
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

export async function walkRepo(rootDir: string, maxFiles: number): Promise<WalkStats> {
  const stats: WalkStats = {
    totalFiles: 0,
    totalBytes: 0,
    languages: {},
    topLevelFolders: new Set<string>(),
    keyFiles: new Set<string>(),
    files: []
  };

  async function walk(current: string, depth: number): Promise<void> {
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
      stats.files.push(relPath);

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

export async function readTextFile(filePath: string, maxChars: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content.slice(0, maxChars).trim();
  } catch {
    return "";
  }
}
