import { CommandResult } from "./types";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFileIfExists } from "../storage/providers-repo";

/**
 * Returns the currently active top-level Codex route.
 */
export function getCurrentProfile(configPath: string, providersPath?: string): CommandResult {
  const document = readStructuredConfig(configPath);
  const providers = providersPath ? readProvidersFileIfExists(providersPath) : null;
  const providerCandidates = document.currentModelProvider && providers
    ? Object.entries(providers.providers)
      .filter(([, provider]) => provider.profile === document.currentModelProvider)
      .map(([name]) => name)
      .sort()
    : [];
  return {
    data: {
      model: document.currentModel,
      modelProvider: document.currentModelProvider,
      provider: providerCandidates.length === 1 ? providerCandidates[0] : null,
      profile: document.currentModelProvider,
    },
  };
}
