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
};

export type BenchmarkResult = {
  deepWikiProxy: {
    overview: string;
    architecture: string;
    buildAndRun: string;
    apiSurface: string;
    testing: string;
  };
  coverageScore: number;
  notes: string[];
};

export type AnalyzeResponse = {
  id: number;
  context: AgentContext;
  benchmark?: BenchmarkResult;
};
