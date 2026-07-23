import { claudeSettingsMatch, summarizeClaudeSettings } from "../domain/claude-providers";
import { readClaudeProvidersFileIfExists, readClaudeSettings } from "../storage/claude-providers-repo";
import { CommandResult } from "./types";

/**
 * Detects which Claude provider matches the current settings.json.
 */
export async function claudeGetCurrent(args: {
  claudeProvidersPath: string;
  claudeSettingsPath: string;
}): Promise<CommandResult> {
  const currentSettings = readClaudeSettings(args.claudeSettingsPath);
  if (!currentSettings) {
    return {
      data: {
        target: "claude",
        active: null,
        status: "no-settings",
        message: "No Claude Code settings.json found.",
      },
    };
  }

  const file = readClaudeProvidersFileIfExists(args.claudeProvidersPath);
  const summary = summarizeClaudeSettings(currentSettings);

  for (const [name, record] of Object.entries(file.providers)) {
    if (claudeSettingsMatch(record.settings, currentSettings)) {
      return {
        data: {
          target: "claude",
          active: name,
          model: summary.model,
          baseUrl: summary.baseUrl,
          status: "managed",
        },
      };
    }
  }

  return {
    data: {
      target: "claude",
      active: null,
      model: summary.model,
      baseUrl: summary.baseUrl,
      status: "unmanaged",
      message: "Current settings do not match any registered Claude provider.",
    },
  };
}
