import * as fs from "node:fs";
import * as path from "node:path";
import { cliError } from "../domain/errors";
import { readClaudeProvidersFile } from "../storage/claude-providers-repo";
import { writeClaudeSettings } from "../storage/claude-providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Switches Claude Code to the target provider by replacing settings.json.
 */
export async function claudeSwitchProvider(args: {
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  claudeProvidersPath: string;
  claudeSettingsPath: string;
  providerName: string;
}): Promise<CommandResult> {
  const providers = readClaudeProvidersFile(args.claudeProvidersPath);
  const provider = providers.providers[args.providerName];
  if (!provider) {
    throw cliError("CLAUDE_PROVIDER_NOT_FOUND", `Claude provider "${args.providerName}" was not found.`, {
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  const claudeDir = path.dirname(args.claudeSettingsPath);
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "claude-switch",
    files: [
      { absolutePath: args.claudeSettingsPath, relativePath: "claude-settings.json" },
    ],
    mutate: () => {
      writeClaudeSettings(args.claudeSettingsPath, provider.settings);
      const env = provider.settings.env as Record<string, string> | undefined;
      return {
        target: "claude",
        provider: args.providerName,
        model: (provider.settings.model as string) ?? null,
        baseUrl: env?.ANTHROPIC_BASE_URL ?? null,
      };
    },
  });
}
