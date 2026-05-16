export type SourceFile = {
  path: string;
  language: string;
  size: number;
  imports: string[];
  exports: string[];
  classes?: string[];
  functions?: string[];
  interfaces?: string[];
  excerpt?: string;
};

export type Module = {
  name: string;
  path: string;
  files: SourceFile[];
  purpose: string;
  responsibilities: string[];
  dependencies: string[];
  exports: string[];
};

export type ComponentNode = {
  id: string;
  name: string;
  type: "module" | "service" | "component" | "library" | "external";
  description: string;
  dependencies: string[];
  exports: string[];
  codeReferences: Array<{ file: string; lines: string }>;
};

export type ArchitectureOverview = {
  purpose: string;
  scope: string;
  mainComponents: ComponentNode[];
  dataFlow: Array<{
    from: string;
    to: string;
    description: string;
  }>;
  externalDependencies: string[];
  layerDescription: Record<string, string>;
};

export type ModuleDoc = {
  module: string;
  path: string;
  purpose: string;
  exports: Array<{
    name: string;
    type: "class" | "function" | "interface" | "constant";
    signature?: string;
    description: string;
    parameters?: Array<{ name: string; type: string; description: string }>;
    returns?: { type: string; description: string };
    examples?: string[];
  }>;
  usage: string;
  relatedModules: string[];
  codeReferences: Array<{ file: string; startLine: number; endLine: number }>;
};

export type DesignPattern = {
  name: string;
  description: string;
  location: Array<{ file: string; lines: string }>;
  rationale: string;
  tradeoffs?: string;
};

export type RuntimeBehavior = {
  startup: string;
  mainFlows: Array<{
    name: string;
    steps: string[];
    errorHandling: string;
  }>;
  stateManagement: string;
  performanceCharacteristics: string;
  scaling: string;
  diagrams?: Array<{
    name: string;
    mermaid: string;
  }>;
};

export type DeepWikiAISummary = {
  projectSummary: string;
  architectureMap: string;
  conventions: string;
  keyFiles: Array<{ file: string; reason: string }>;
};

export type DeepResearchAnalysis = {
  subsystem: string;
  design: string;
  keyDecisions: Array<{
    decision: string;
    rationale: string;
    alternatives: string[];
    location: Array<{ file: string; lines: string }>;
  }>;
  potentialIssues: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    suggestion: string;
    location?: Array<{ file: string; lines: string }>;
  }>;
  optimizationSuggestions: Array<{
    area: string;
    suggestion: string;
    currentApproach: string;
    proposedApproach: string;
  }>;
};

export type DeepWikiAnalysis = {
  summary: {
    repoUrl: string;
    analyzedAt: string;
    language: string;
    totalSize: number;
  };
  aiSummary?: DeepWikiAISummary;
  architecture: ArchitectureOverview;
  modules: ModuleDoc[];
  designPatterns: DesignPattern[];
  overallDesign: {
    principles: string[];
    philosophies: string[];
    architectural_style: string;
    strengths: string[];
    weaknesses: string[];
  };
  runtimeBehavior: RuntimeBehavior;
  deepResearch?: DeepResearchAnalysis[];
  conversationalGrounding: {
    fileReferenceMap: Record<string, SourceFile>;
    importGraph: Record<string, string[]>;
  };
};
