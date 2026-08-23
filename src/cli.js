"use strict";

const { skillsAdd } = require("./commands/skillsAdd.js");

const USAGE = `Usage: cmd skills add <owner/repo> --skill <skill-name> [options]

Commands:
  skills add <owner/repo> --skill <skill-name>   Fetch a skill from a GitHub repo into .claude/skills/

Options:
  --branch <ref>   Branch, tag, or commit to read from (defaults to the repo's default branch)
  --dest <dir>     Directory to install the skill into (default: .claude/skills)
  --force          Overwrite the destination if it already exists

Environment:
  GITHUB_TOKEN      Optional token used to authenticate GitHub API requests (needed for private repos / higher rate limits)
`;

async function run(argv) {
  const [group, subcommand, ...rest] = argv;

  if (!group || group === "--help" || group === "-h") {
    process.stdout.write(USAGE);
    return;
  }

  if (group === "skills" && subcommand === "add") {
    return skillsAdd(rest);
  }

  if (group === "skills") {
    throw new Error(`Unknown "skills" subcommand "${subcommand || ""}". Try "cmd skills add".`);
  }

  throw new Error(`Unknown command "${group}". Run "cmd --help" for usage.`);
}

module.exports = { run, USAGE };
