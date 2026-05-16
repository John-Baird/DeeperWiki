const fs = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");

function parseGitHubRepo(repoUrl) {
  const url = new URL(repoUrl);
  if (!/github\.com$/i.test(url.hostname)) {
    throw new Error("Only github.com repositories are supported in Netlify mode.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid GitHub repository URL.");
  }
  return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
}

async function fetchDefaultBranch(owner, repo, token) {
  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
        "User-Agent": "repo-context-system",
        Accept: "application/vnd.github+json"
      }
    : {
        "User-Agent": "repo-context-system",
        Accept: "application/vnd.github+json"
      };

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub repo metadata error (${response.status}): ${response.statusText}`);
  }
  const json = await response.json();
  return String(json?.default_branch || "main");
}

async function downloadBuffer(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub download error (${response.status}): ${response.statusText}. ${text.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchRepoToDir(repoUrl, tempRoot) {
  const { owner, repo } = parseGitHubRepo(repoUrl);
  const token = process.env.GITHUB_TOKEN || "";
  const headers = token
    ? {
        Authorization: `Bearer ${token}`,
        "User-Agent": "repo-context-system",
        Accept: "application/vnd.github+json"
      }
    : {
        "User-Agent": "repo-context-system",
        Accept: "application/vnd.github+json"
      };

  const branch = await fetchDefaultBranch(owner, repo, token);
  const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
  const zipBuffer = await downloadBuffer(zipUrl, headers);

  const baseDir = await fs.mkdtemp(path.join(tempRoot, "repo-context-"));
  const zipPath = path.join(baseDir, "repo.zip");
  await fs.writeFile(zipPath, zipBuffer);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(baseDir, true);
  const extractedRoot = path.join(baseDir, `${repo}-${branch}`);
  return { repoDir: extractedRoot, workDir: baseDir, branch };
}

module.exports = {
  fetchRepoToDir
};

