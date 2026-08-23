"use strict";

const fs = require("fs/promises");
const path = require("path");
const { collectFiles, downloadFile } = require("../github.js");

const CANDIDATE_DIRS = (skillName) => [
  `.claude/skills/${skillName}`,
  `skills/${skillName}`,
];

const REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * skills add <owner/repo> --skill <skill-name> [--branch <ref>] [--dest <dir>] [--force]
 */
async function skillsAdd(args) {
  const { repoSlug, skillName, branch, dest, force } = parseArgs(args);

  if (!repoSlug) {
    throw new Error("Missing required argument <owner/repo>.");
  }
  if (!REPO_SLUG_RE.test(repoSlug)) {
    throw new Error(
      `Invalid repository "${repoSlug}". Expected the form <owner>/<repo>.`
    );
  }
  if (!skillName) {
    throw new Error("Missing required --skill <skill-name> flag.");
  }

  const [owner, repo] = repoSlug.split("/");
  const destRoot = path.resolve(dest, skillName);

  const exists = await pathExists(destRoot);
  if (exists && !force) {
    throw new Error(
      `Destination "${path.relative(process.cwd(), destRoot)}" already exists. Use --force to overwrite.`
    );
  }

  let files = null;
  let foundAt = null;
  for (const candidate of CANDIDATE_DIRS(skillName)) {
    files = await collectFiles(owner, repo, candidate, branch);
    if (files !== null) {
      foundAt = candidate;
      break;
    }
  }

  if (files === null) {
    const checked = CANDIDATE_DIRS(skillName).join(", ");
    throw new Error(
      `Could not find skill "${skillName}" in ${repoSlug}. Checked: ${checked}. ` +
        `Verify the repository and skill name, and that the repo is public (or set GITHUB_TOKEN for private repos).`
    );
  }

  if (files.length === 0) {
    throw new Error(`Skill directory "${foundAt}" in ${repoSlug} is empty.`);
  }

  for (const file of files) {
    const target = path.join(destRoot, file.relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const content = await downloadFile(file.downloadUrl);
    await fs.writeFile(target, content);
  }

  console.log(
    `Added skill "${skillName}" from ${repoSlug}:${foundAt} -> ${path.relative(process.cwd(), destRoot)} (${files.length} file${files.length === 1 ? "" : "s"})`
  );
}

function parseArgs(args) {
  let repoSlug = null;
  let skillName = null;
  let branch = undefined;
  let dest = ".claude/skills";
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--skill":
        skillName = args[++i];
        break;
      case "--branch":
        branch = args[++i];
        break;
      case "--dest":
        dest = args[++i];
        break;
      case "--force":
        force = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown flag "${arg}".`);
        }
        if (repoSlug !== null) {
          throw new Error(`Unexpected argument "${arg}".`);
        }
        repoSlug = arg;
    }
  }

  return { repoSlug, skillName, branch, dest, force };
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

module.exports = { skillsAdd };
