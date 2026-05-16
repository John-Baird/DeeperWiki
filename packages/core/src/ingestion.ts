import fs from "fs/promises";
import path from "path";
import { SourceFile, Module } from "./deep-types";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  ".idea",
  "__pycache__",
  "target",
  ".pytest_cache"
]);

const SOURCE_EXTS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".cs",
  ".rb",
  ".php",
  ".swift"
];

const CONFIG_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  ".github/workflows",
  "docker-compose.yml",
  "Dockerfile"
];

export async function ingestRepository(repoDir: string, maxFiles: number): Promise<{
  files: SourceFile[];
  configs: SourceFile[];
  structure: Record<string, string[]>;
}> {
  const files: SourceFile[] = [];
  const configs: SourceFile[] = [];
  const structure: Record<string, string[]> = {};
  let fileCount = 0;

  async function walk(current: string, depth: number): Promise<void> {
    if (fileCount >= maxFiles) return;

    try {
      const entries = await fs.readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        if (fileCount >= maxFiles) return;

        const fullPath = path.join(current, entry.name);
        const relPath = path.relative(repoDir, fullPath);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          if (depth < 6) {
            await walk(fullPath, depth + 1);
          }
          continue;
        }

        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        const dirKey = path.dirname(relPath) || "root";

        if (!structure[dirKey]) {
          structure[dirKey] = [];
        }
        structure[dirKey].push(entry.name);

        if (SOURCE_EXTS.includes(ext)) {
          const sourceFile = await parseSourceFile(fullPath, relPath, ext);
          files.push(sourceFile);
          fileCount++;
        } else if (CONFIG_FILES.some((cf) => relPath.includes(cf)) || CONFIG_FILES.includes(entry.name)) {
          const configFile = await parseConfigFile(fullPath, relPath);
          configs.push(configFile);
        }
      }
    } catch {
      // ignore walk errors
    }
  }

  await walk(repoDir, 0);
  return { files, configs, structure };
}

async function parseSourceFile(
  filePath: string,
  relPath: string,
  ext: string
): Promise<SourceFile> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const fileSize = content.length;

    const imports = extractImports(content, ext);
    const exports = extractExports(content, ext);
    const classes = extractClasses(content, ext);
    const functions = extractFunctions(content, ext);
    const interfaces = extractInterfaces(content, ext);

    const excerpt = content.split("\n").slice(0, 20).join("\n");

    return {
      path: relPath,
      language: getLanguage(ext),
      size: fileSize,
      imports,
      exports,
      classes,
      functions,
      interfaces,
      excerpt
    };
  } catch {
    return {
      path: relPath,
      language: getLanguage(ext),
      size: 0,
      imports: [],
      exports: [],
      excerpt: ""
    };
  }
}

async function parseConfigFile(filePath: string, relPath: string): Promise<SourceFile> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return {
      path: relPath,
      language: "config",
      size: content.length,
      imports: [],
      exports: [],
      excerpt: content.slice(0, 500)
    };
  } catch {
    return {
      path: relPath,
      language: "config",
      size: 0,
      imports: [],
      exports: []
    };
  }
}

function extractImports(content: string, ext: string): string[] {
  const imports = new Set<string>();

  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    const tsImportRegex = /import\s+(?:{[^}]*}|[^\s]+)\s+from\s+["']([^"']+)["']/g;
    const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    while ((match = tsImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
  } else if (ext === ".py") {
    const pyImportRegex = /(?:from\s+[\w.]+\s+import|import)\s+([\w.]+(?:\s*,\s*[\w.]+)*)/g;
    let match;
    while ((match = pyImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
  } else if (ext === ".go") {
    const goImportRegex = /import\s+\(\s*([\s\S]*?)\)/;
    const match = content.match(goImportRegex);
    if (match) {
      const imports_section = match[1];
      const imp_regex = /["']([^"']+)["']/g;
      let imp_match;
      while ((imp_match = imp_regex.exec(imports_section)) !== null) {
        imports.add(imp_match[1]);
      }
    }
  } else if (ext === ".rs") {
    const rustImportRegex = /use\s+([\w:]+)/g;
    let match;
    while ((match = rustImportRegex.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }

  return Array.from(imports).slice(0, 20);
}

function extractExports(content: string, ext: string): string[] {
  const exports = new Set<string>();

  if ([".ts", ".tsx"].includes(ext)) {
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }
  } else if ([".js", ".jsx"].includes(ext)) {
    const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }
  }

  return Array.from(exports).slice(0, 10);
}

function extractClasses(content: string, ext: string): string[] {
  const classes = new Set<string>();

  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    const classRegex = /class\s+(\w+)/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.add(match[1]);
    }
  } else if (ext === ".py") {
    const classRegex = /^class\s+(\w+)/gm;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.add(match[1]);
    }
  } else if (ext === ".java") {
    const classRegex = /(?:public|private|protected)?\s*class\s+(\w+)/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.add(match[1]);
    }
  }

  return Array.from(classes).slice(0, 10);
}

function extractFunctions(content: string, ext: string): string[] {
  const functions = new Set<string>();

  if ([".ts", ".tsx"].includes(ext)) {
    const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1] || match[2];
      if (name) functions.add(name);
    }
  }

  return Array.from(functions).slice(0, 10);
}

function extractInterfaces(content: string, ext: string): string[] {
  const interfaces = new Set<string>();

  if ([".ts", ".tsx"].includes(ext)) {
    const ifaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
    let match;
    while ((match = ifaceRegex.exec(content)) !== null) {
      interfaces.add(match[1]);
    }
  } else if (ext === ".java") {
    const ifaceRegex = /(?:public\s+)?interface\s+(\w+)/g;
    let match;
    while ((match = ifaceRegex.exec(content)) !== null) {
      interfaces.add(match[1]);
    }
  }

  return Array.from(interfaces).slice(0, 10);
}

function getLanguage(ext: string): string {
  const langMap: Record<string, string> = {
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
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift"
  };
  return langMap[ext] || "Unknown";
}

export function buildImportGraph(files: SourceFile[]): Record<string, string[]> {
  const graph: Record<string, string[]> = {};

  for (const file of files) {
    graph[file.path] = file.imports || [];
  }

  return graph;
}

export async function extractReadmeContent(repoDir: string): Promise<string> {
  const candidates = ["README.md", "readme.md", "README.rst", "README.txt"];

  for (const name of candidates) {
    try {
      const content = await fs.readFile(path.join(repoDir, name), "utf-8");
      return content.slice(0, 3000);
    } catch {
      // continue
    }
  }

  return "";
}
