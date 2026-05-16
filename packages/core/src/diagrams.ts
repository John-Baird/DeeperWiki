import { ComponentNode, ArchitectureOverview, SourceFile } from "./deep-types";

export function generateArchitectureDiagram(architecture: ArchitectureOverview): string {
  const nodes = architecture.mainComponents
    .map((c) => `${c.id}["${c.name}<br/>${c.type}"]`)
    .join("\n  ");

  const edges = architecture.dataFlow
    .map((df) => `${df.from} -->|${df.description}| ${df.to}`)
    .join("\n  ");

  return `graph TD
  ${nodes}
  ${edges}`;
}

export function generateDependencyGraph(
  importGraph: Record<string, string[]>,
  files: SourceFile[]
): string {
  const fileMap = Object.fromEntries(files.map((f) => [f.path, f]));
  const dirToFiles: Record<string, SourceFile[]> = {};

  for (const file of files) {
    const dir = file.path.split("/")[0] || "root";
    if (!dirToFiles[dir]) {
      dirToFiles[dir] = [];
    }
    dirToFiles[dir].push(file);
  }

  const dirNodes = Object.keys(dirToFiles)
    .slice(0, 15)
    .map((dir) => `${sanitizeId(dir)}["${dir}"]`)
    .join("\n  ");

  const edges: string[] = [];
  for (const [file, imports] of Object.entries(importGraph)) {
    if (edges.length > 30) break;

    const fromDir = file.split("/")[0] || "root";
    const filteredImports = imports.slice(0, 3);

    for (const imp of filteredImports) {
      const toFile = Object.keys(fileMap).find((f) => f.endsWith(imp) || imp.includes(f));
      if (toFile) {
        const toDir = toFile.split("/")[0] || "root";
        if (fromDir !== toDir) {
          edges.push(`${sanitizeId(fromDir)} --> ${sanitizeId(toDir)}`);
        }
      }
    }
  }

  const uniqueEdges = Array.from(new Set(edges)).join("\n  ");

  return `graph LR
  ${dirNodes}
  ${uniqueEdges}`;
}

export function generateClassDiagram(files: SourceFile[]): string {
  const typescriptFiles = files.filter((f) => f.language === "TypeScript").slice(0, 10);

  const classes = typescriptFiles
    .flatMap((f) => (f.classes || []).map((c) => ({ class: c, file: f.path })))
    .slice(0, 15);

  const classDefs = classes
    .map((c) => `class ${c.class} {
    file: ${c.file}
  }`)
    .join("\n  ");

  return `classDiagram
  ${classDefs}`;
}

export function generateDataFlowDiagram(
  purpose: string,
  components: ComponentNode[]
): string {
  const flows = components
    .filter((c) => c.type !== "external")
    .slice(0, 10)
    .map((c) => `${sanitizeId(c.id)}["${c.name}"]`)
    .join("\n  ");

  const relationships = components
    .flatMap((c) =>
      c.dependencies.slice(0, 2).map((dep) => `${sanitizeId(c.id)} --> ${sanitizeId(dep)}`)
    )
    .slice(0, 15)
    .join("\n  ");

  return `graph TD
  Start["Start: ${purpose}"]
  ${flows}
  End["Complete"]
  Start --> ${sanitizeId(components[0]?.id || "process")}
  ${relationships}
  ${components[components.length - 1] ? `${sanitizeId(components[components.length - 1].id)} --> End` : ""}`;
}

export function generateSequenceDiagram(
  mainFlows: Array<{ name: string; steps: string[] }>
): string {
  if (mainFlows.length === 0) {
    return "sequenceDiagram\n  participant A\n  participant B\n  A->>B: sample interaction";
  }

  const flow = mainFlows[0];
  const participants = ["Client", "Server", "Database"];

  const interactions = flow.steps
    .slice(0, 10)
    .map((step, i) => {
      const from = participants[i % participants.length];
      const to = participants[(i + 1) % participants.length];
      return `${from}->>+${to}: ${step.slice(0, 50)}`;
    })
    .join("\n  ");

  return `sequenceDiagram
  participant Client
  participant Server
  participant Database
  ${interactions}`;
}

export function generateStateChart(
  stateManagement: string,
  mainFlows: Array<{ name: string; steps: string[] }>
): string {
  const states = [
    "Idle",
    "Processing",
    "Success",
    "Error",
    ...mainFlows.slice(0, 3).map((f) => f.name)
  ];

  const stateDefs = states.slice(0, 8).map((s) => sanitizeId(s)).join("\n  ");

  const transitions = [
    `${sanitizeId(states[0])} --> ${sanitizeId(states[1])}`,
    `${sanitizeId(states[1])} --> ${sanitizeId(states[2])}`,
    `${sanitizeId(states[1])} --> ${sanitizeId(states[3])}`
  ].join("\n  ");

  return `stateDiagram-v2
  ${stateDefs}
  ${transitions}`;
}

export function generateGitGraph(): string {
  return `gitGraph commit id: "init"
  commit id: "feature branch"
  branch develop
  commit id: "dev work"
  checkout main
  merge develop
  commit id: "release"`;
}

function sanitizeId(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "n")
    .slice(0, 30);
}

export function generateAllDiagrams(
  architecture: ArchitectureOverview,
  importGraph: Record<string, string[]>,
  files: SourceFile[],
  mainFlows: Array<{ name: string; steps: string[] }>,
  stateManagement: string
): Array<{ name: string; mermaid: string }> {
  return [
    {
      name: "System Architecture",
      mermaid: generateArchitectureDiagram(architecture)
    },
    {
      name: "Dependency Graph",
      mermaid: generateDependencyGraph(importGraph, files)
    },
    {
      name: "Data Flow",
      mermaid: generateDataFlowDiagram(architecture.purpose, architecture.mainComponents)
    },
    {
      name: "Main Workflow",
      mermaid: generateSequenceDiagram(mainFlows)
    },
    {
      name: "State Transitions",
      mermaid: generateStateChart(stateManagement, mainFlows)
    }
  ];
}
