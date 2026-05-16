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

export type AgentContext = {
  summary: RepoSummary;
  readmeExcerpt: string;
  structure: RepoStructure;
  techStackHints: string[];
  setupHints: string[];
  risks: string[];
};

export type DeepWikiProxy = {
  overview: string;
  architecture: string;
  buildAndRun: string;
  apiSurface: string;
  testing: string;
};

export type BenchmarkResult = {
  deepWikiProxy: DeepWikiProxy;
  coverageScore: number;
  notes: string[];
};

export type AnalyzeResult = {
  context: AgentContext;
};

export type BenchmarkPayload = {
  context: AgentContext;
  benchmark: BenchmarkResult;
};
