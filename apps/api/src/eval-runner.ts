import fs from "fs/promises";
import path from "path";
import { runEval } from "./repo";

const DEFAULT_REPOS = [
  "https://github.com/honojs/hono",
  "https://github.com/langchain-ai/langchain",
  "https://github.com/vercel/next.js"
];

function parseRepoArgs(args: string[]): string[] {
  const cleaned = args.map((item) => item.trim()).filter(Boolean);
  return cleaned.length >= 3 ? cleaned : DEFAULT_REPOS;
}

function renderMarkdownSummary(result: Awaited<ReturnType<typeof runEval>>): string {
  const lines: string[] = [];
  lines.push("# Eval Results");
  lines.push("");
  lines.push(`Evaluated: ${result.evaluatedAt}`);
  lines.push("");
  lines.push("| Repo | Ours | DeepWiki | Winner |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const repo of result.repos) {
    lines.push(
      `| ${repo.context.summary.repoUrl} | ${repo.benchmark.ourSystemScore} | ${repo.benchmark.deepWikiScore} | ${repo.benchmark.winner} |`
    );
  }
  lines.push("");
  lines.push(
    `Aggregate: ours ${result.aggregate.oursAverage}, deepwiki ${result.aggregate.deepWikiAverage}, wins ${result.aggregate.oursWins}/${result.aggregate.totalRepos}.`
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const repoUrls = parseRepoArgs(process.argv.slice(2));
  const result = await runEval(repoUrls);

  const outputDir = path.resolve(__dirname, "../data");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "eval-latest.json"), JSON.stringify(result, null, 2), "utf-8");
  await fs.writeFile(path.join(outputDir, "eval-latest.md"), renderMarkdownSummary(result), "utf-8");

  console.log(renderMarkdownSummary(result));
  console.log("");
  console.log(`Saved artifacts: ${path.join(outputDir, "eval-latest.json")}`);
  console.log(`Saved artifacts: ${path.join(outputDir, "eval-latest.md")}`);
}

main().catch((error) => {
  console.error("Eval runner failed:", error);
  process.exit(1);
});
