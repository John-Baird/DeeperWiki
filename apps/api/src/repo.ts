import fs from "fs/promises";
import os from "os";
import path from "path";
import simpleGit from "simple-git";
import { analyzeRepo, scoreAgainstProxy, generateDeepWikiProxy, BenchmarkResult } from "@repo/core";

export type BenchmarkPayload = {
  context: Awaited<ReturnType<typeof analyzeRepo>>;
  benchmark: BenchmarkResult;
};

export async function analyzeRepoFromUrl(repoUrl: string): Promise<Awaited<ReturnType<typeof analyzeRepo>>> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();

  try {
    await git.clone(repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    return await analyzeRepo(repoUrl, tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function benchmarkRepoFromUrl(repoUrl: string): Promise<BenchmarkPayload> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();

  try {
    await git.clone(repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    const context = await analyzeRepo(repoUrl, tempDir);
    const proxy = generateDeepWikiProxy(context);
    const benchmark = scoreAgainstProxy(proxy, context);
    return { context, benchmark };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
