import { buildManagedProfileViews } from "../domain/config";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFileIfExists } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Returns the lightweight config profile listing.
 */
export function listConfigProfilesView(args: { configPath: string; providersPath: string }): CommandResult {
  const document = readStructuredConfig(args.configPath);
  const providers = readProvidersFileIfExists(args.providersPath);
  const profiles = buildManagedProfileViews(document, providers).map((profile) => ({
    name: profile.name,
    managed: profile.managed,
    isActive: profile.isActive,
    linkedProviders: profile.linkedProviders,
    model: profile.model,
    modelProvider: profile.modelProvider,
    baseUrl: profile.baseUrl,
    source: profile.source,
  }));

  return {
    data: {
      currentModel: document.currentModel,
      currentModelProvider: document.currentModelProvider,
      legacyProfile: document.legacyProfile,
      profiles,
      count: profiles.length,
    },
  };
}
