# cmd

A small CLI for pulling a single [Claude Code skill](https://docs.claude.com/en/docs/claude-code) out of a GitHub repository and installing it locally.

## Usage

```
npx cmd skills add <owner/repo> --skill <skill-name>
```

This looks for the skill in `.claude/skills/<skill-name>` (falling back to `skills/<skill-name>`) inside `<owner>/<repo>`, downloads every file in that directory, and writes it to `.claude/skills/<skill-name>` in the current directory.

### Options

| Flag | Description |
| --- | --- |
| `--skill <skill-name>` | **Required.** Name of the skill directory to fetch. |
| `--branch <ref>` | Branch, tag, or commit to read from. Defaults to the repository's default branch. |
| `--dest <dir>` | Directory to install the skill into. Defaults to `.claude/skills`. |
| `--force` | Overwrite the destination directory if it already exists. |

### Authentication

Requests go through the public GitHub REST API and are unauthenticated by default, which is subject to GitHub's low unauthenticated rate limit and can't reach private repos. Set `GITHUB_TOKEN` (or `GH_TOKEN`) in the environment to authenticate:

```
GITHUB_TOKEN=ghp_xxx npx cmd skills add owner/repo --skill my-skill
```

## Example

```
npx cmd skills add anthropics/skills --skill pdf
```

installs the `pdf` skill from `anthropics/skills` into `./.claude/skills/pdf`.

## Development

```
npm test
```
