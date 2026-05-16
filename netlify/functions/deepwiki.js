const { z } = require("zod");

const bodySchema = z.object({
  repoUrl: z.string().url()
});

function toRepoName(repoUrl) {
  const url = new URL(repoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid repo URL");
  return `${parts[0]}/${parts[1]}`;
}

async function callDeepWikiTool(name, argumentsPayload) {
  const token = process.env.DEEPWIKI_TOKEN || process.env.DEVIN_API_KEY || "";
  const endpoint =
    process.env.DEEPWIKI_ENDPOINT || (token ? "https://mcp.devin.ai/mcp" : "https://mcp.deepwiki.com/mcp");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["x-api-key"] = token;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: argumentsPayload }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const detail = body.slice(0, 500);
    const hint =
      response.status === 401 || response.status === 403
        ? " Check DEEPWIKI_TOKEN/DEVIN_API_KEY and use the authenticated endpoint."
        : "";
    throw new Error(`DeepWiki API error (${response.status}): ${response.statusText}. ${detail}${hint}`);
  }
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.result === "string") return parsed.result;
  } catch {
    // continue
  }
  const lines = text.split("\n");
  let last = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload);
      if (typeof event?.result === "string") last = event.result;
    } catch {}
  }
  return last || "";
}

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
  if (!parsed.success) return { statusCode: 400, body: "Invalid repoUrl" };

  try {
    const repoName = toRepoName(parsed.data.repoUrl);
    const wikiStructure = await callDeepWikiTool("read_wiki_structure", { repoName });
    const wikiContents = await callDeepWikiTool("read_wiki_contents", { repoName });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: { repoName, wikiStructure, wikiContents } })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "DeepWiki fetch failed", details: error instanceof Error ? error.message : String(error) })
    };
  }
};
