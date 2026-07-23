import * as fs from "node:fs";
import { cliError } from "../domain/errors";
import { cleanClaudeProviderRecord, ClaudeProviderRecord } from "../domain/claude-providers";
import { readClaudeProvidersFileIfExists, writeClaudeProvidersFile } from "../storage/claude-providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Adds a new Claude provider profile from a settings file or direct input.
 */
export async function claudeAddProvider(args: {
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  claudeProvidersPath: string;
  providerName: string;
  fromFile?: string;
  settings?: Record<string, unknown>;
  note?: string;
  tags?: string[];
}): Promise<CommandResult> {
  let settings: Record<string, unknown>;

  if (args.fromFile) {
    if (!fs.existsSync(args.fromFile)) {
      throw cliError("INVALID_ARGUMENT", `Settings file not found: ${args.fromFile}`);
    }
    try {
      settings = JSON.parse(fs.readFileSync(args.fromFile, "utf8")) as Record<string, unknown>;
    } catch {
      throw cliError("INVALID_ARGUMENT", `Failed to parse settings file: ${args.fromFile}`);
    }
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw cliError("INVALID_ARGUMENT", "Settings file must contain a JSON object.");
    }
  } else if (args.settings) {
    settings = args.settings;
  } else {
    throw cliError("INVALID_ARGUMENT", "Either --from-file or settings must be provided.");
  }

  const record: ClaudeProviderRecord = cleanClaudeProviderRecord({
    settings,
    note: args.note,
    tags: args.tags,
  });

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "claude-add",
    files: [
      { absolutePath: args.claudeProvidersPath, relativePath: "claude-providers.json" },
    ],
    mutate: () => {
      const existing = readClaudeProvidersFileIfExists(args.claudeProvidersPath);
      if (existing.providers[args.providerName]) {
        throw cliError("CLAUDE_PROVIDER_ALREADY_EXISTS", `Claude provider "${args.providerName}" already exists.`, {
          provider: args.providerName,
          suggestion: 'Use a different name or run `codexs remove --claude <name>` first.',
        });
      }
      existing.providers[args.providerName] = record;
      writeClaudeProvidersFile(args.claudeProvidersPath, existing);
      return {
        target: "claude",
        provider: args.providerName,
        model: (settings.model as string) ?? null,
      };
    },
  });
}
