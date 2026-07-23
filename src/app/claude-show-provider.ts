import { summarizeClaudeSettings } from "../domain/claude-providers";
import { readClaudeProviderRecord } from "../storage/claude-providers-repo";
import { CommandResult } from "./types";

/**
 * Shows details of a single Claude provider profile.
 */
export async function claudeShowProvider(args: {
  claudeProvidersPath: string;
  providerName: string;
}): Promise<CommandResult> {
  const record = readClaudeProviderRecord(args.claudeProvidersPath, args.providerName);
  const summary = summarizeClaudeSettings(record.settings);
  const env = record.settings.env as Record<string, string> | undefined;

  return {
    data: {
      target: "claude",
      provider: args.providerName,
      model: summary.model,
      baseUrl: summary.baseUrl,
      theme: summary.theme,
      note: record.note ?? null,
      tags: record.tags ?? [],
      env: env ?? {},
      settings: record.settings,
    },
  };
}
