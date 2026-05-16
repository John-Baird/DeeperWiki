export type AgentContext = {
  summary: {
    repoUrl: string;
    analyzedAt: string;
    defaultBranch?: string;
    totalFiles: number;
    totalBytes: number;
    languages: Record<string, number>;
  };
  readmeExcerpt: string;
  structure: {
    topLevelFolders: string[];
    keyFiles: string[];
    packageScripts: Record<string, string>;
    dependencies: string[];
    devDependencies: string[];
  };
  techStackHints: string[];
  setupHints: string[];
  risks: string[];
  aiSummary?: {
    projectSummary: string;
    architectureMap: string;
    conventions: string;
    keyFiles: Array<{ file: string; reason: string }>;
  };
};

export type BenchmarkResult = {
  repoUrl: string;
  evaluatedAt: string;
  ourSystemScore: number;
  deepWikiScore: number;
  winner: "ours" | "deepwiki" | "tie";
  dimensions: Array<{
    name: string;
    ourScore: number;
    deepWikiScore: number;
    winner: "ours" | "deepwiki" | "tie";
    explanation: string;
    ourEvidence: {
      good: string[];
      bad: string[];
    };
    deepWikiEvidence: {
      good: string[];
      bad: string[];
    };
  }>;
  notes: string[];
  ourResponse: string;
  deepWikiResponse: string;
  deepWiki: {
    repoName: string;
    wikiStructure: string;
    wikiContents: string;
  };
  deepWikiError?: string;
};

export type AnalyzeResponse = {
  id: number;
  context: AgentContext;
  benchmark?: BenchmarkResult;
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

export type ModuleDoc = {
  module: string;
  path: string;
  purpose: string;
  exports: Array<{
    name: string;
    type: "class" | "function" | "interface" | "constant";
    signature?: string;
    description: string;
  }>;
  usage: string;
  relatedModules: string[];
};

export type DeepWikiResponse = {
  id: number;
  analysis: {
    repoName: string;
    wikiStructure: string;
    wikiContents: string;
  };
};

export type EvalResponse = {
  evaluatedAt: string;
  aggregate: {
    totalRepos: number;
    oursAverage: number;
    deepWikiAverage: number;
    oursWins: number;
    deepWikiWins: number;
    ties: number;
  };
  repos: Array<{
    context: {
      summary: {
        repoUrl: string;
      };
    };
    benchmark: BenchmarkResult;
  }>;
};
