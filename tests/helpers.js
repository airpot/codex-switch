"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const fixtureCodexDir = path.join(repoRoot, "dev-codex", "local-sandbox");

function makeToolHomeRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeToolHomeWithManagedState() {
  const toolHomeDir = makeToolHomeRoot("codex-switch-tool-home-");
  const packageJson = require("../package.json");
  fs.mkdirSync(toolHomeDir, { recursive: true });
  fs.writeFileSync(path.join(toolHomeDir, "providers.json"), `${JSON.stringify({ providers: {} }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(toolHomeDir, "codex-switch.json"), `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`, "utf8");
  return toolHomeDir;
}

function withToolHome(toolHomeDir, run) {
  const previous = process.env.CODEXS_HOME;
  process.env.CODEXS_HOME = toolHomeDir;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.CODEXS_HOME;
    } else {
      process.env.CODEXS_HOME = previous;
    }
  }
}

/**
 * Creates a temporary copy of the repository Codex sandbox fixture.
 */
function makeSandboxCopy() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-cli-e2e-"));
  if (fs.existsSync(fixtureCodexDir)) {
    fs.cpSync(fixtureCodexDir, tempRoot, { recursive: true });
    return tempRoot;
  }
  fs.writeFileSync(path.join(tempRoot, "config.toml"), [
    'model = "gpt-5.4"',
    'model_provider = "freemodel"',
    "",
    "[model_providers.freemodel]",
    'name = "freemodel"',
    'base_url = "https://free.example/v1"',
    'wire_api = "responses"',
    "requires_openai_auth = true",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(tempRoot, "auth.json"), `${JSON.stringify({
    auth_mode: "apikey",
    OPENAI_API_KEY: "sk-fixture",
  }, null, 2)}\n`, "utf8");
  return tempRoot;
}

/**
 * Creates an empty Codex directory for init-oriented tests.
 */
function makeEmptyCodexDir() {
  const codexDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-empty-"));
  fs.mkdirSync(path.join(codexDir, "backups"), { recursive: true });
  return codexDir;
}

/**
 * Executes the built CLI entrypoint logic in-process and returns rendered output.
 */
async function runBuiltCli(input) {
  const { executeCommand } = require("../dist/commands/dispatch.js");
  const { parseArgs } = require("../dist/commands/args.js");
  const { buildHelpText, getKnownCommandNames, isKnownCommandNameForHelp } = require("../dist/commands/help.js");
  const { cliError, normalizeError } = require("../dist/domain/errors.js");
  const { renderFailure, renderSuccess } = require("../dist/cli/output.js");
  const packageJson = require("../package.json");
  const args = Array.isArray(input) ? input : input.args;

  const codexDirIndex = args.indexOf("--codex-dir");
  const toolHomeDir = !Array.isArray(input) && input.toolHomeDir
    ? path.resolve(input.toolHomeDir)
    : codexDirIndex >= 0 && args[codexDirIndex + 1]
      ? path.resolve(args[codexDirIndex + 1])
    : makeToolHomeRoot("codex-switch-tool-home-");
  return withToolHome(toolHomeDir, async () => {
    const parsed = parseArgs(args);
    if (parsed.versionRequested) {
      return {
        status: 0,
        stdout: `${packageJson.version}\n`,
        stderr: "",
      };
    }

    if (parsed.helpRequested) {
      if (parsed.helpTarget && !isKnownCommandNameForHelp(parsed.helpTarget)) {
        const rendered = renderFailure(
          { command: "help", options: parsed.globalOptions },
          normalizeError(
            cliError("INVALID_ARGUMENT", `Unknown help topic: ${parsed.helpTarget}`, {
              availableCommands: getKnownCommandNames(),
            })
          )
        );
        return {
          status: rendered.exitCode,
          stdout: rendered.stdout.join("\n"),
          stderr: rendered.stderr.join("\n"),
        };
      }

      return {
        status: 0,
        stdout: `${buildHelpText(parsed.helpTarget)}\n`,
        stderr: "",
      };
    }

    if (!parsed.command) {
      return {
        status: 0,
        stdout: `${buildHelpText()}\n`,
        stderr: "",
      };
    }

    const ctx = {
      command: parsed.command,
      options: parsed.globalOptions,
    };

    try {
      const result = await executeCommand(ctx, parsed);
      const rendered = renderSuccess(ctx, result);
      return {
        status: rendered.exitCode,
        stdout: rendered.stdout.join("\n"),
        stderr: rendered.stderr.join("\n"),
      };
    } catch (error) {
      const rendered = renderFailure(ctx, normalizeError(error));
      return {
        status: rendered.exitCode,
        stdout: rendered.stdout.join("\n"),
        stderr: rendered.stderr.join("\n"),
      };
    } finally {
      if ((Array.isArray(input) && codexDirIndex < 0) || (!Array.isArray(input) && !input.toolHomeDir)) {
        fs.rmSync(toolHomeDir, { recursive: true, force: true });
      }
    }
  });
}

/**
 * Parses a JSON envelope from either stdout or stderr based on exit status.
 */
async function runJsonCli(input) {
  const result = await runBuiltCli(input);
  const raw = result.status === 0 ? result.stdout : result.stderr;
  return {
    ...result,
    payload: JSON.parse(raw),
  };
}

module.exports = {
  repoRoot,
  fixtureCodexDir,
  withToolHome,
  makeToolHomeWithManagedState,
  makeSandboxCopy,
  makeEmptyCodexDir,
  runBuiltCli,
  runJsonCli,
};
