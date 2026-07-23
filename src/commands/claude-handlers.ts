import { claudeAddProvider } from "../app/claude-add-provider";
import { claudeGetCurrent } from "../app/claude-current";
import { claudeListProviders } from "../app/claude-list-providers";
import { claudeRemoveProvider } from "../app/claude-remove-provider";
import { claudeShowProvider } from "../app/claude-show-provider";
import { claudeSwitchProvider } from "../app/claude-switch-provider";
import { CommandResult } from "../app/types";
import { cliError } from "../domain/errors";
import { createClaudePaths } from "../storage/claude-paths";
import { resolveCodexSwitchHome } from "../storage/codex-paths";
import { canPrompt, confirmProviderRemoval } from "../interaction/interactive";
import { getSingleOption, hasFlag } from "./args";
import { CommandExecutionContext, ParsedCommand } from "./types";
import { createPromptRuntime } from "../interaction/prompt";
import { readClaudeProvidersFileIfExists } from "../storage/claude-providers-repo";
import { claudeSettingsMatch } from "../domain/claude-providers";
import { readClaudeSettings } from "../storage/claude-providers-repo";

/**
 * Commands that support the --claude flag.
 */
const CLAUDE_COMMANDS = new Set(["add", "switch", "list", "show", "current", "remove"]);

/**
 * Returns true when the parsed command targets Claude Code instead of Codex.
 */
export function isClaudeCommand(command: string | null, commandOptions: Map<string, string[]>): boolean {
  if (!command) return false;
  return CLAUDE_COMMANDS.has(command) && commandOptions.has("--claude");
}

/**
 * Extracts the provider name from either the positional or the --claude flag value.
 * The arg parser may consume the next token as --claude's value when the user types
 * `codexs add --claude <name>`. This helper normalizes both orderings.
 */
function resolveClaudeProviderName(parsed: ParsedCommand): string | null {
  const positional = parsed.positionals[0] ?? null;
  if (positional) return positional;

  const claudeValues = parsed.commandOptions.get("--claude") ?? [];
  const firstValue = claudeValues[0];
  if (firstValue && firstValue !== "true") {
    return firstValue;
  }

  return null;
}

/**
 * Dispatches a --claude-flagged command to the appropriate Claude service.
 */
export async function handleClaudeCommand(
  ctx: CommandExecutionContext,
  parsed: ParsedCommand,
  runtime = createPromptRuntime()
): Promise<CommandResult> {
  const toolHomeDir = resolveCodexSwitchHome();
  const claudePaths = createClaudePaths(toolHomeDir);
  const lockPath = require("node:path").join(toolHomeDir, ".codex-switch.lock");
  const backupsDir = require("node:path").join(toolHomeDir, "backups");
  const latestBackupPath = require("node:path").join(toolHomeDir, "backups", "latest.json");

  switch (ctx.command) {
    case "add": {
      let providerName = resolveClaudeProviderName(parsed);
      const fromFile = getSingleOption(parsed.commandOptions, "--from-file", false);
      const note = getSingleOption(parsed.commandOptions, "--note", false);
      const tags = parsed.commandOptions.get("--tag") ?? [];

      if (!providerName) {
        if (ctx.options.json || !runtime.isInteractive()) {
          throw cliError("INVALID_ARGUMENT", "Claude add requires a provider name. Usage: codexs add --claude <name> --from-file <path>");
        }
        const inquirer = await import("inquirer");
        const answer = await inquirer.default.prompt([{
          type: "input",
          name: "providerName",
          message: "Claude provider name:",
          validate: (input: string) => input.trim().length > 0 || "Name is required.",
        }]);
        providerName = answer.providerName.trim();
      }

      const resolvedName = providerName as string;

      if (!fromFile) {
        if (ctx.options.json || !runtime.isInteractive()) {
          throw cliError("INVALID_ARGUMENT", "Claude add requires --from-file <path> in non-interactive mode.");
        }
        const inquirer = await import("inquirer");
        const answer = await inquirer.default.prompt([{
          type: "input",
          name: "fromFile",
          message: "Path to Claude settings JSON file:",
          validate: (input: string) => {
            if (input.trim().length === 0) return "Path is required.";
            const fs = require("node:fs");
            if (!fs.existsSync(input.trim())) return `File not found: ${input.trim()}`;
            return true;
          },
        }]);
        return claudeAddProvider({
          lockPath,
          backupsDir,
          latestBackupPath,
          claudeProvidersPath: claudePaths.claudeProvidersPath,
          providerName: resolvedName,
          fromFile: answer.fromFile.trim(),
          note: note ?? undefined,
          tags: tags.length > 0 ? tags : undefined,
        });
      }

      return claudeAddProvider({
        lockPath,
        backupsDir,
        latestBackupPath,
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        providerName: resolvedName,
        fromFile,
        note: note ?? undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
    }

    case "switch": {
      let providerName = resolveClaudeProviderName(parsed);
      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForClaudeProviderSelection(
          claudePaths.claudeProvidersPath,
          claudePaths.claudeSettingsPath,
          "Choose a Claude provider to switch to"
        );
      }

      if (!providerName) {
        throw cliError("CLAUDE_PROVIDER_NOT_FOUND", "Missing provider name for switch --claude command.");
      }

      return claudeSwitchProvider({
        lockPath,
        backupsDir,
        latestBackupPath,
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        claudeSettingsPath: claudePaths.claudeSettingsPath,
        providerName,
      });
    }

    case "list":
      return claudeListProviders({
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        claudeSettingsPath: claudePaths.claudeSettingsPath,
      });

    case "show": {
      let providerName = resolveClaudeProviderName(parsed);
      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForClaudeProviderSelection(
          claudePaths.claudeProvidersPath,
          claudePaths.claudeSettingsPath,
          "Choose a Claude provider to show"
        );
      }

      if (!providerName) {
        throw cliError("INVALID_ARGUMENT", "Missing provider name for show --claude command.");
      }

      return claudeShowProvider({
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        providerName,
      });
    }

    case "current":
      return claudeGetCurrent({
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        claudeSettingsPath: claudePaths.claudeSettingsPath,
      });

    case "remove": {
      let providerName = resolveClaudeProviderName(parsed);
      const force = hasFlag(parsed.commandOptions, "--force");

      if (!providerName && canPrompt(runtime, ctx.options.json)) {
        providerName = await promptForClaudeProviderSelection(
          claudePaths.claudeProvidersPath,
          claudePaths.claudeSettingsPath,
          "Choose a Claude provider to remove"
        );
      }

      if (!providerName) {
        throw cliError("CLAUDE_PROVIDER_NOT_FOUND", "Missing provider name for remove --claude command.");
      }

      if (!force && !canPrompt(runtime, ctx.options.json)) {
        throw cliError("INVALID_ARGUMENT", "remove --claude requires --force in non-interactive mode.");
      }

      if (canPrompt(runtime, ctx.options.json)) {
        await confirmProviderRemoval(runtime, providerName);
      }

      return claudeRemoveProvider({
        lockPath,
        backupsDir,
        latestBackupPath,
        claudeProvidersPath: claudePaths.claudeProvidersPath,
        providerName,
      });
    }

    default:
      throw cliError("UNKNOWN_COMMAND", `Command "${ctx.command}" does not support --claude.`);
  }
}

/**
 * Interactive Claude provider selector.
 */
async function promptForClaudeProviderSelection(
  claudeProvidersPath: string,
  claudeSettingsPath: string,
  message: string
): Promise<string> {
  const file = readClaudeProvidersFileIfExists(claudeProvidersPath);
  const names = Object.keys(file.providers).sort();
  if (names.length === 0) {
    throw cliError("CLAUDE_PROVIDERS_NOT_FOUND", "No Claude providers registered. Run `codexs add --claude` first.");
  }

  const currentSettings = readClaudeSettings(claudeSettingsPath);
  const choices = names.map((name) => {
    const record = file.providers[name];
    const isActive = currentSettings ? claudeSettingsMatch(record.settings, currentSettings) : false;
    const env = record.settings.env as Record<string, string> | undefined;
    const model = (record.settings.model as string) ?? "";
    const suffix = isActive ? " (current)" : "";
    const baseUrl = env?.ANTHROPIC_BASE_URL ?? "";
    return {
      name: `${name}${suffix} [model=${model}, base=${baseUrl}]`,
      value: name,
    };
  });

  const inquirer = await import("inquirer");
  const answer = await inquirer.default.prompt([{
    type: "list",
    name: "provider",
    message,
    choices,
  }]);

  return answer.provider;
}
