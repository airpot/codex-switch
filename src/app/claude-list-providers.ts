import { claudeSettingsMatch, summarizeClaudeSettings } from "../domain/claude-providers";
import { readClaudeProvidersFileIfExists } from "../storage/claude-providers-repo";
import { readClaudeSettings } from "../storage/claude-providers-repo";
import { CommandResult } from "./types";

/**
 * Lists all registered Claude providers with active detection.
 */
export async function claudeListProviders(args: {
  claudeProvidersPath: string;
  claudeSettingsPath: string;
}): Promise<CommandResult> {
  const file = readClaudeProvidersFileIfExists(args.claudeProvidersPath);
  const currentSettings = readClaudeSettings(args.claudeSettingsPath);

  const providers = Object.entries(file.providers).map(([name, record]) => {
    const summary = summarizeClaudeSettings(record.settings);
    const isActive = currentSettings ? claudeSettingsMatch(record.settings, currentSettings) : false;
    return {
      name,
      model: summary.model,
      baseUrl: summary.baseUrl,
      theme: summary.theme,
      note: record.note ?? null,
      tags: record.tags ?? [],
      isActive,
    };
  });

  return {
    data: {
      target: "claude",
      providers,
      count: providers.length,
    },
  };
}
