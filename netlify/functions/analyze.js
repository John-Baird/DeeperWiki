const fs = require("fs/promises");
const os = require("os");
const { z } = require("zod");
const { analyzeRepo } = require("./lib");
const { fetchRepoToDir } = require("./repo-fetch");

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

  let fetched = null;

  try {
    fetched = await fetchRepoToDir(parsed.data.repoUrl, os.tmpdir());
    const context = await analyzeRepo(parsed.data.repoUrl, fetched.repoDir);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Analysis failed", details: error instanceof Error ? error.message : String(error) })
    };
  } finally {
    if (fetched?.workDir) {
      await fs.rm(fetched.workDir, { recursive: true, force: true });
    }
  }
};
