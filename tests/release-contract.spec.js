"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { repoRoot, runBuiltCli } = require("./helpers");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

module.exports = {
  name: "release contract",
  tests: [
    {
      name: "package metadata is 0.3.4 and points to the public repository",
      run() {
        const packageJson = require("../package.json");
        const packageLock = require("../package-lock.json");
        assert.equal(packageJson.name, "@airpot/codex-switch");
        assert.equal(packageJson.version, "0.3.4");
        assert.equal(packageLock.name, "@airpot/codex-switch");
        assert.equal(packageLock.version, "0.3.4");
        assert.equal(packageLock.packages[""].name, "@airpot/codex-switch");
        assert.equal(packageLock.packages[""].version, "0.3.4");
        assert.equal(packageJson.repository.url, "git+https://github.com/airpot/codex-switch.git");
      },
    },
    {
      name: "current docs use the 0.3.4 release line and fact sources",
      run() {
        for (const relativePath of [
          "README.md",
          "README.CN.md",
          "README.AI.md",
          "docs/cli-usage.md",
          "docs/codex-switch-product-overview.md",
          "docs/codex-switch-technical-architecture.md",
          "docs/Tests/testing.md",
          "CHANGELOG.md",
        ]) {
          const content = read(relativePath);
          assert.match(content, /0\.2\.1|0\.3\.0|0\.3\.1|0\.3\.2|0\.3\.3|0\.3\.4/, relativePath);
        }
        for (const relativePath of ["README.md", "README.CN.md", "README.AI.md", "docs/cli-usage.md", "CHANGELOG.md"]) {
          assert.match(read(relativePath), /0\.3\.4/, relativePath);
        }
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/PRD/codex-switch-prd-v0.3.0.md")));
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/Design/codex-switch-v0.3.0-design.md")));
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/PRD/codex-switch-prd-v0.2.1.md")));
        assert.ok(fs.existsSync(path.join(repoRoot, "docs/Design/codex-switch-v0.2.1-design.md")));
        assert.match(read("README.md"), /Codex 与 Claude Code|Claude Code/);
        assert.match(read("README.AI.md"), /local-first CLI for managing and switching Codex and Claude Code/);
      },
    },
    {
      name: "help exposes provider management and automatic routing command surface",
      async run() {
        const result = await runBuiltCli(["--help"]);
        assert.equal(result.status, 0);
        for (const command of [
          "init",
          "migrate",
          "list",
          "show",
          "current",
          "status",
          "route configure",
          "route start",
          "route status",
          "route stop",
          "config show",
          "config list-profiles",
          "add",
          "edit",
          "switch",
          "remove",
          "import",
          "export",
          "backups list",
          "rollback",
          "doctor",
          "setup",
        ]) {
          assert.match(result.stdout, new RegExp(command.replace(" ", "\\s+")));
        }
        assert.doesNotMatch(result.stdout, /login copilot|--copilot|bridge start|bridge status|bridge stop|Copilot SDK/i);
      },
    },
    {
      name: "version command reports 0.3.4",
      async run() {
        const result = await runBuiltCli(["--version"]);
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), "0.3.4");
      },
    },
  ],
};
