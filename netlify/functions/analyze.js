const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { z } = require("zod");
const { analyzeRepo, materializeGitHubRepo } = require("./lib");

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

  try {
    await materializeGitHubRepo(parsed.data.repoUrl, tempDir);
    const context = await analyzeRepo(parsed.data.repoUrl, tempDir);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context })
    };
  } catch {
    return { statusCode: 500, body: "Analysis failed" };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
