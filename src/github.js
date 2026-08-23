"use strict";

const API_ROOT = "https://api.github.com";

function authHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cmd-skills-cli",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getContents(owner, repo, path, ref) {
  const url = new URL(
    `${API_ROOT}/repos/${owner}/${repo}/contents/${path}`
  );
  if (ref) url.searchParams.set("ref", ref);

  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub API request failed (${res.status} ${res.statusText}) for ${owner}/${repo}:${path}. ${body}`
    );
  }
  return res.json();
}

/**
 * Recursively collects every file under `path` in the repo.
 * Returns an array of { relativePath, downloadUrl }, where relativePath
 * is relative to `path` itself.
 */
async function collectFiles(owner, repo, path, ref) {
  const entries = await getContents(owner, repo, path, ref);
  if (entries === null) return null;

  const items = Array.isArray(entries) ? entries : [entries];
  const files = [];

  for (const item of items) {
    if (item.type === "dir") {
      const nested = await collectFiles(owner, repo, item.path, ref);
      if (nested) {
        for (const file of nested) {
          files.push({
            relativePath: `${item.name}/${file.relativePath}`,
            downloadUrl: file.downloadUrl,
          });
        }
      }
    } else if (item.type === "file") {
      files.push({ relativePath: item.name, downloadUrl: item.download_url });
    }
  }

  return files;
}

async function downloadFile(downloadUrl) {
  const res = await fetch(downloadUrl, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(
      `Failed to download ${downloadUrl} (${res.status} ${res.statusText})`
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

module.exports = { getContents, collectFiles, downloadFile };
