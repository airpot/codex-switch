import { cliError } from "../domain/errors";
import { readClaudeProvidersFile, writeClaudeProvidersFile } from "../storage/claude-providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Removes a Claude provider profile from the registry.
 */
export async function claudeRemoveProvider(args: {
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  claudeProvidersPath: string;
  providerName: string;
}): Promise<CommandResult> {
  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "claude-remove",
    files: [
      { absolutePath: args.claudeProvidersPath, relativePath: "claude-providers.json" },
    ],
    mutate: () => {
      const existing = readClaudeProvidersFile(args.claudeProvidersPath);
      if (!existing.providers[args.providerName]) {
        throw cliError("CLAUDE_PROVIDER_NOT_FOUND", `Claude provider "${args.providerName}" was not found.`, {
          availableProviders: Object.keys(existing.providers).sort(),
        });
      }
      delete existing.providers[args.providerName];
      writeClaudeProvidersFile(args.claudeProvidersPath, existing);
      return {
        target: "claude",
        provider: args.providerName,
        removed: true,
      };
    },
  });
}
