export type RepoSummary = {
  repoUrl: string;
  analyzedAt: string;
  defaultBranch?: string;
  totalFiles: number;
  totalBytes: number;
  languages: Record<string, number>;
};

export type RepoStructure = {
  topLevelFolders: string[];
  keyFiles: string[];
  packageScripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
};

export type AISummary = {
  projectSummary: string;
  architectureMap: string;
  conventions: string;
  keyFiles: Array<{ file: string; reason: string }>;
};

export type AgentContext = {
  summary: RepoSummary;
  readmeExcerpt: string;
  structure: RepoStructure;
  techStackHints: string[];
  setupHints: string[];
  risks: string[];
  aiSummary?: AISummary;
};

export type DeepWikiProxy = {
  overview: string;
  architecture: string;
  buildAndRun: string;
  apiSurface: string;
  testing: string;
};

export type BenchmarkDimension = {
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
};

export type BenchmarkResult = {
  repoUrl: string;
  evaluatedAt: string;
  ourSystemScore: number;
  deepWikiScore: number;
  winner: "ours" | "deepwiki" | "tie";
  dimensions: BenchmarkDimension[];
  notes: string[];
  ourResponse: string;
  deepWikiResponse: string;
  deepWiki: {
    repoName: string;
    wikiStructure: string;
    wikiContents: string;
  };
  deepWikiError?: string;
  legacyProxy?: DeepWikiProxy;
};

export type AnalyzeResult = {
  context: AgentContext;
};

export type BenchmarkPayload = {
  context: AgentContext;
  benchmark: BenchmarkResult;
};
