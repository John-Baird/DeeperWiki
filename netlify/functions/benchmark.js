const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const simpleGit = require("simple-git");
const { z } = require("zod");
const { analyzeRepo, generateDeepWikiProxy, scoreAgainstProxy } = require("./lib");

const bodySchema = z.object({
  repoUrl: z.string().url()
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return { statusCode: 400, body: "Invalid repoUrl" };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-context-"));
  const git = simpleGit();

  try {
    await git.clone(parsed.data.repoUrl, tempDir, ["--depth", "1", "--single-branch"]);
    const context = await analyzeRepo(parsed.data.repoUrl, tempDir);
    const proxy = generateDeepWikiProxy(context);
    const benchmark = scoreAgainstProxy(proxy, context);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, benchmark })
    };
  } catch {
    return { statusCode: 500, body: "Benchmark failed" };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
