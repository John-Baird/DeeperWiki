import { LLMProvider } from "./llm";
import {
  SourceFile,
  DeepWikiAnalysis,
  ArchitectureOverview,
  ModuleDoc,
  DeepResearchAnalysis,
  RuntimeBehavior,
  ComponentNode,
  DeepWikiAISummary
} from "./deep-types";
import {
  ingestRepository,
  buildImportGraph,
  extractReadmeContent
} from "./ingestion";
import { generateAllDiagrams } from "./diagrams";

export class DeepAnalyzer {
  private llm: LLMProvider | null;
  private repoDir: string;

  constructor(repoDir: string, llm?: LLMProvider) {
    this.repoDir = repoDir;
    this.llm = llm || null;
  }

  async analyze(repoUrl: string): Promise<DeepWikiAnalysis> {
    const { files, configs } = await ingestRepository(this.repoDir, 500);
    const readme = await extractReadmeContent(this.repoDir);
    const importGraph = buildImportGraph(files);

    const summary = {
      repoUrl,
      analyzedAt: new Date().toISOString(),
      language: this.inferPrimaryLanguage(files),
      totalSize: files.reduce((sum, f) => sum + f.size, 0)
    };

    const architecture = await this.generateArchitecture(
      files,
      configs,
      readme,
      importGraph
    );

    const modules = await this.generateModuleDocs(files, importGraph);

    const designPatterns = await this.identifyDesignPatterns(files);

    const overallDesign = await this.analyzeOverallDesign(
      files,
      configs,
      readme,
      architecture
    );

    const runtimeBehavior = await this.analyzeRuntimeBehavior(
      files,
      overallDesign,
      modules
    );

    const aiSummary = this.llm
      ? await this.generateAISummary(readme, architecture, modules, runtimeBehavior)
      : undefined;

    const deepResearch = this.llm
      ? await this.performDeepResearch(files, modules, architecture)
      : undefined;

    const diagrams = generateAllDiagrams(
      architecture,
      importGraph,
      files,
      runtimeBehavior.mainFlows,
      runtimeBehavior.stateManagement
    );

    return {
      summary,
      aiSummary,
      architecture,
      modules,
      designPatterns,
      overallDesign,
      runtimeBehavior: { ...runtimeBehavior, diagrams },
      deepResearch,
      conversationalGrounding: {
        fileReferenceMap: Object.fromEntries(
          files.map((f) => [f.path, f])
        ),
        importGraph
      }
    };
  }

  private async generateArchitecture(
    files: SourceFile[],
    configs: SourceFile[],
    readme: string,
    importGraph: Record<string, string[]>
  ): Promise<ArchitectureOverview> {
    if (!this.llm) {
      return this.generateArchitectureFallback(files, importGraph);
    }

    const prompt = `Analyze this repository architecture based on:
- Files: ${files.map((f) => f.path).join(", ")}
- Primary language: ${this.inferPrimaryLanguage(files)}
- README excerpt: ${readme.slice(0, 500)}

Provide a JSON response with:
{
  "purpose": "What does this repo do?",
  "scope": "Scope of the system",
  "mainComponents": [{"id": "comp1", "name": "...", "type": "module|service|component|library|external", "description": "...", "dependencies": [], "exports": []}],
  "dataFlow": [{"from": "...", "to": "...", "description": "..."}],
  "externalDependencies": ["..."],
  "layerDescription": {"presentation": "...", "business": "..."}
}`;

    try {
      const result = await this.llm.generateStructured<ArchitectureOverview>(
        prompt
      );
      return result;
    } catch {
      return this.generateArchitectureFallback(files, importGraph);
    }
  }

  private generateArchitectureFallback(
    files: SourceFile[],
    _importGraph: Record<string, string[]>
  ): ArchitectureOverview {
    const typescriptFiles = files.filter((f) => f.language === "TypeScript");
    const mainComponent: ComponentNode = {
      id: "main",
      name: "Application",
      type: "component",
      description: "Main application logic",
      dependencies: [],
      exports: typescriptFiles.flatMap((f) => f.exports || []),
      codeReferences: typescriptFiles.slice(0, 3).map((f) => ({
        file: f.path,
        lines: "1-50"
      }))
    };

    return {
      purpose: "Multi-language repository",
      scope: `${files.length} source files, ${this.inferPrimaryLanguage(files)}`,
      mainComponents: [mainComponent],
      dataFlow: [],
      externalDependencies: Array.from(
        new Set(files.flatMap((f) => f.imports || []))
      ).slice(0, 10),
      layerDescription: {
        logic: "Core application logic",
        integration: "External service integration"
      }
    };
  }

  private async generateModuleDocs(
    files: SourceFile[],
    importGraph: Record<string, string[]>
  ): Promise<ModuleDoc[]> {
    if (!this.llm) {
      return this.generateModuleDocsFallback(files, importGraph);
    }

    const keyFiles = files
      .filter((f) => f.exports && f.exports.length > 0)
      .slice(0, 10);

    const docs: ModuleDoc[] = [];

    for (const file of keyFiles) {
      const prompt = `Generate module documentation for ${file.path}:
Language: ${file.language}
Exports: ${file.exports?.join(", ")}
Imports: ${(file.imports || []).slice(0, 5).join(", ")}

Respond with JSON:
{
  "purpose": "What does this module do?",
  "exports": [{"name": "...", "type": "class|function|interface|constant", "description": "...", "parameters": []}],
  "usage": "How to use this module",
  "relatedModules": ["..."]
}`;

      try {
        const result = await this.llm.generateStructured<Omit<ModuleDoc, "module" | "path" | "codeReferences">>(
          prompt
        );
        docs.push({
          module: file.path.split("/").pop() || file.path,
          path: file.path,
          purpose: result.purpose,
          exports: result.exports,
          usage: result.usage,
          relatedModules: result.relatedModules,
          codeReferences: [{ file: file.path, startLine: 1, endLine: 50 }]
        });
      } catch {
        docs.push({
          module: file.path.split("/").pop() || file.path,
          path: file.path,
          purpose: "Module exported symbols",
          exports: (file.exports || []).map((e) => ({
            name: e,
            type: "function",
            description: `Exported: ${e}`
          })),
          usage: "See source file",
          relatedModules: [],
          codeReferences: [{ file: file.path, startLine: 1, endLine: 50 }]
        });
      }
    }

    return docs;
  }

  private generateModuleDocsFallback(
    files: SourceFile[],
    _importGraph: Record<string, string[]>
  ): ModuleDoc[] {
    return files
      .filter((f) => f.exports && f.exports.length > 0)
      .slice(0, 5)
      .map((f) => ({
        module: f.path.split("/").pop() || f.path,
        path: f.path,
        purpose: `${f.language} module with ${f.exports?.length || 0} exports`,
        exports: (f.exports || []).map((e) => ({
          name: e,
          type: "function" as const,
          signature: `${e}(...)`,
          description: `Exported from ${f.path}`
        })),
        usage: "Import and use as needed",
        relatedModules: [],
        codeReferences: [{ file: f.path, startLine: 1, endLine: 50 }]
      }));
  }

  private async identifyDesignPatterns(files: SourceFile[]) {
    if (!this.llm) {
      return [];
    }

    const prompt = `Identify 3-5 design patterns in these files:
${files
  .slice(0, 10)
  .map((f) => `${f.path}: ${f.classes?.join(", ")}`)
  .join("\n")}

Respond with JSON:
{
  "patterns": [
    {
      "name": "Pattern Name",
      "description": "...",
      "rationale": "Why this pattern is used",
      "location": [{"file": "...", "lines": "1-10"}]
    }
  ]
}`;

    try {
      const result = await this.llm.generateStructured<{
        patterns: Array<any>;
      }>(prompt);
      return result.patterns || [];
    } catch {
      return [];
    }
  }

  private async analyzeOverallDesign(
    files: SourceFile[],
    _configs: SourceFile[],
    readme: string,
    _architecture: ArchitectureOverview
  ) {
    if (!this.llm) {
      return this.analyzeOverallDesignFallback(files, readme);
    }

    const prompt = `Analyze the overall design philosophy of this repository:
README: ${readme.slice(0, 1000)}
Languages: ${Array.from(new Set(files.map((f) => f.language))).join(", ")}
File count: ${files.length}

Respond with JSON:
{
  "principles": ["..."],
  "philosophies": ["..."],
  "architectural_style": "...",
  "strengths": ["..."],
  "weaknesses": ["..."]
}`;

    try {
      const result = await this.llm.generateStructured<{
        principles: string[];
        philosophies: string[];
        architectural_style: string;
        strengths: string[];
        weaknesses: string[];
      }>(prompt);
      return result;
    } catch {
      return this.analyzeOverallDesignFallback(files, readme);
    }
  }

  private analyzeOverallDesignFallback(files: SourceFile[], readme: string) {
    const hasTests = files.some((f) => f.path.includes("test") || f.path.includes("spec"));
    const isPythonHeavy = files.filter((f) => f.language === "Python").length > 0;
    const hasCI = readme.includes("GitHub Actions") || readme.includes("CI/CD");

    return {
      principles: [
        hasTests ? "Test-driven development" : "Feature-first development",
        isPythonHeavy ? "Python conventions" : "Modern JavaScript/TypeScript",
        hasCI ? "Continuous Integration" : "Manual testing"
      ],
      philosophies: [
        "Modular architecture",
        "Clear separation of concerns"
      ],
      architectural_style: "Layered architecture",
      strengths: [
        "Clear module structure",
        "Good documentation presence"
      ],
      weaknesses: [
        "Scale considerations for large teams"
      ]
    };
  }

  private async analyzeRuntimeBehavior(
    files: SourceFile[],
    overallDesign: any,
    modules: ModuleDoc[]
  ): Promise<RuntimeBehavior> {
    if (!this.llm) {
      return this.analyzeRuntimeBehaviorFallback(files, modules);
    }

    const prompt = `Describe the runtime behavior based on:
Modules: ${modules.map((m) => m.module).join(", ")}
Principles: ${overallDesign.principles.join(", ")}

Respond with JSON:
{
  "startup": "How the application starts",
  "mainFlows": [{"name": "...", "steps": ["..."], "errorHandling": "..."}],
  "stateManagement": "How state is managed",
  "performanceCharacteristics": "Expected performance",
  "scaling": "How it scales"
}`;

    try {
      const result = await this.llm.generateStructured<Omit<RuntimeBehavior, "diagrams">>(
        prompt
      );
      return { ...result, diagrams: [] };
    } catch {
      return this.analyzeRuntimeBehaviorFallback(files, modules);
    }
  }

  private async generateAISummary(
    readme: string,
    architecture: ArchitectureOverview,
    modules: ModuleDoc[],
    runtimeBehavior: RuntimeBehavior
  ): Promise<DeepWikiAISummary | undefined> {
    if (!this.llm) {
      return undefined;
    }

    const prompt = `Create a concise JSON summary for an AI coding agent.

Focus:
1) Project summary: what it is, stack, how it is organized
2) Architecture map: key modules, relationships, data flow
3) Conventions: patterns, naming, error handling
4) Key files: most important files for new contributors and why

Context:
README excerpt: ${readme.slice(0, 1200)}
Purpose: ${architecture.purpose}
Scope: ${architecture.scope}
Main components: ${architecture.mainComponents.map((c) => c.name).join(", ")}
Data flow: ${architecture.dataFlow.map((f) => `${f.from} -> ${f.to}`).join("; ")}
External dependencies: ${architecture.externalDependencies.join(", ")}
Modules: ${modules.map((m) => m.path).join(", ")}
Runtime startup: ${runtimeBehavior.startup}
Runtime flows: ${runtimeBehavior.mainFlows.map((f) => f.name).join(", ")}

Respond with JSON:
{
  "projectSummary": "...",
  "architectureMap": "...",
  "conventions": "...",
  "keyFiles": [{"file": "...", "reason": "..."}]
}`;

    try {
      const raw = await this.llm.generateStructured<DeepWikiAISummary>(prompt);
      return {
        projectSummary: this.toText(raw?.projectSummary),
        architectureMap: this.toText(raw?.architectureMap),
        conventions: this.toText(raw?.conventions),
        keyFiles: Array.isArray(raw?.keyFiles)
          ? raw.keyFiles.map((item) => ({
              file: String(item?.file || ""),
              reason: this.toText(item?.reason)
            }))
          : []
      };
    } catch {
      return undefined;
    }
  }

  private toText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((item) => this.toText(item)).join(" ");
    if (value && typeof value === "object") {
      const text = Object.values(value as Record<string, unknown>)
        .map((item) => this.toText(item))
        .filter((item) => item.trim().length > 0)
        .join(" ");
      return text || JSON.stringify(value);
    }
    return value ? String(value) : "";
  }

  private analyzeRuntimeBehaviorFallback(
    files: SourceFile[],
    modules: ModuleDoc[]
  ): RuntimeBehavior {
    return {
      startup: "Application initializes core modules and establishes connections",
      mainFlows: [
        {
          name: "Request Processing",
          steps: [
            "Receive input",
            "Process through modules",
            "Generate output",
            "Return result"
          ],
          errorHandling: "Try-catch with fallback responses"
        },
        {
          name: "Data Flow",
          steps: [
            "Ingest data",
            "Transform",
            "Persist or transmit"
          ],
          errorHandling: "Validation and retry logic"
        }
      ],
      stateManagement:
        modules.length > 0
          ? "State managed through module interfaces"
          : "Stateless processing",
      performanceCharacteristics: `${files.length} files, expected linear performance`,
      scaling: "Horizontal scaling via module replication"
    };
  }

  private async performDeepResearch(
    files: SourceFile[],
    modules: ModuleDoc[],
    architecture: ArchitectureOverview
  ): Promise<DeepResearchAnalysis[]> {
    if (!this.llm || modules.length === 0) {
      return [];
    }

    const analyses: DeepResearchAnalysis[] = [];

    for (const module of modules.slice(0, 3)) {
      const prompt = `Perform deep research on the ${module.module} subsystem:
Purpose: ${module.purpose}
Exports: ${module.exports.map((e) => e.name).join(", ")}

Provide JSON:
{
  "design": "Detailed design rationale",
  "keyDecisions": [{"decision": "...", "rationale": "...", "alternatives": []}],
  "potentialIssues": [{"issue": "...", "severity": "low|medium|high", "suggestion": "..."}],
  "optimizationSuggestions": [{"area": "...", "suggestion": "...", "currentApproach": "...", "proposedApproach": "..."}]
}`;

      try {
        const result = await this.llm.generateStructured<Omit<DeepResearchAnalysis, "subsystem">>(
          prompt
        );
        analyses.push({
          subsystem: module.module,
          ...result
        });
      } catch {
        // skip on error
      }
    }

    return analyses;
  }

  private inferPrimaryLanguage(files: SourceFile[]): string {
    const langCount = new Map<string, number>();

    for (const file of files) {
      langCount.set(file.language, (langCount.get(file.language) || 0) + 1);
    }

    let maxLang = "Mixed";
    let maxCount = 0;

    for (const [lang, count] of langCount) {
      if (count > maxCount) {
        maxCount = count;
        maxLang = lang;
      }
    }

    return maxLang;
  }
}

export async function analyzeWithDeepWiki(
  repoUrl: string,
  repoDir: string,
  llm?: LLMProvider
): Promise<DeepWikiAnalysis> {
  const analyzer = new DeepAnalyzer(repoDir, llm);
  return analyzer.analyze(repoUrl);
}
