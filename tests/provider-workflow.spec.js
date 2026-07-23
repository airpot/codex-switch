"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  makeSandboxCopy,
  makeToolHomeWithManagedState,
  runBuiltCli,
  runJsonCli,
} = require("./helpers");

function writeProviders(toolHomeDir, providers) {
  fs.writeFileSync(path.join(toolHomeDir, "providers.json"), `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
}

module.exports = {
  name: "provider-management workflow",
  tests: [
    {
      name: "init add switch status doctor works through json envelope",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();

        let result = await runJsonCli({ toolHomeDir, args: ["init", "--json", "--codex-dir", codexDir] });
        assert.equal(result.payload.ok, true);
        assert.equal(result.payload.command, "init");

        result = await runJsonCli({
          toolHomeDir,
          args: [
            "add",
            "gamma",
            "--profile",
            "gamma",
            "--model",
            "gpt-5-mini",
            "--api-key",
            "sk-gamma",
            "--base-url",
            "https://gamma.example/v1",
            "--json",
            "--codex-dir",
            codexDir,
          ],
        });
        assert.equal(result.payload.ok, true);
        assert.equal(result.payload.data.provider, "gamma");
        assert.equal(result.payload.data.modelProvider, "gamma");

        result = await runJsonCli({ toolHomeDir, args: ["switch", "gamma", "--json", "--codex-dir", codexDir] });
        assert.equal(result.payload.ok, true);
        assert.equal(result.payload.data.provider, "gamma");

        result = await runJsonCli({ toolHomeDir, args: ["status", "--json", "--codex-dir", codexDir] });
        assert.equal(result.payload.ok, true);
        assert.equal(result.payload.data.provider, "gamma");
        assert.equal(result.payload.data.currentModelProvider, "gamma");
        assert.equal(result.payload.data.auth.valid, true);

        result = await runJsonCli({ toolHomeDir, args: ["doctor", "--json", "--codex-dir", codexDir] });
        assert.equal(result.payload.ok, true);
        assert.equal(result.payload.command, "doctor");
        assert.ok(Array.isArray(result.payload.data.issues));
      },
    },
    {
      name: "list human output omits provider type and reports ambiguous active provider",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeProviders(toolHomeDir, {
          first: { profile: "freemodel", apiKey: "sk-first", baseUrl: "https://free.example/v1", model: "gpt-5.4" },
          second: { profile: "freemodel", apiKey: "sk-second", baseUrl: "https://free.example/v1", model: "gpt-5.4" },
        });

        const result = await runBuiltCli({ toolHomeDir, args: ["list", "--codex-dir", codexDir] });
        assert.equal(result.status, 0);
        assert.match(result.stdout, /Current provider: ambiguous \(first, second\)/);
        assert.match(result.stdout, /first -> freemodel/);
        assert.doesNotMatch(result.stdout, /\[(direct|copilot)\]/i);
      },
    },
    {
      name: "doctor reports baseUrl drift as provider projection drift",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeProviders(toolHomeDir, {
          freemodel: { profile: "freemodel", apiKey: "sk-free", baseUrl: "https://drift.example/v1", model: "gpt-5.4" },
        });

        const result = await runJsonCli({ toolHomeDir, args: ["doctor", "--json", "--codex-dir", codexDir] });
        assert.equal(result.payload.ok, true);
        assert.ok(result.payload.data.issues.some((issue) => issue.code === "PROVIDER_BASE_URL_MISMATCH"));
      },
    },
    {
      name: "setup remains deprecated pointer",
      async run() {
        const result = await runBuiltCli(["setup"]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /COMMAND_DEPRECATED/);
        assert.match(result.stderr, /init, migrate/);
      },
    },
    {
      name: "migrate is advanced adopt helper in help",
      async run() {
        const result = await runBuiltCli(["help", "migrate"]);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /advanced adopt helper/i);
        assert.doesNotMatch(result.stdout, /fresh.*default/i);
      },
    },
  ],
};
