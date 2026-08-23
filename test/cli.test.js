"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run, USAGE } = require("../src/cli.js");

test("no args prints usage", async () => {
  let output = "";
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    await run([]);
  } finally {
    process.stdout.write = original;
  }
  assert.equal(output, USAGE);
});

test("unknown command is rejected", async () => {
  await assert.rejects(() => run(["bogus"]), /Unknown command "bogus"/);
});

test("unknown skills subcommand is rejected", async () => {
  await assert.rejects(
    () => run(["skills", "bogus"]),
    /Unknown "skills" subcommand "bogus"/
  );
});

test("skills add requires <owner/repo>", async () => {
  await assert.rejects(
    () => run(["skills", "add"]),
    /Missing required argument <owner\/repo>/
  );
});

test("skills add requires --skill", async () => {
  await assert.rejects(
    () => run(["skills", "add", "owner/repo"]),
    /Missing required --skill/
  );
});

test("skills add validates <owner/repo> shape", async () => {
  await assert.rejects(
    () => run(["skills", "add", "not-a-repo-slug", "--skill", "foo"]),
    /Invalid repository/
  );
});
