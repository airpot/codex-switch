import { buildManagedProfileViews } from "../domain/config";
import { cliError } from "../domain/errors";
import { findProvidersByProfile } from "../domain/providers";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFileIfExists } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Returns the structured config view, optionally filtered to one profile.
 */
export function showConfig(args: { configPath: string; providersPath: string; profileName?: string | null }): CommandResult {
  const document = readStructuredConfig(args.configPath);
  const providers = readProvidersFileIfExists(args.providersPath);
  const views = buildManagedProfileViews(document, providers);

  let selectedProfile: string | null = null;
  let profiles = views;
  if (args.profileName) {
    const found = views.find((view) => view.name === args.profileName);
    if (!found) {
      throw cliError("PROFILE_NOT_FOUND", `Profile "${args.profileName}" was not found.`, {
        profile: args.profileName,
      });
    }
    selectedProfile = args.profileName;
    profiles = [found];
  }

  return {
    data: {
      currentModel: document.currentModel,
      currentModelProvider: document.currentModelProvider,
      legacyProfile: document.legacyProfile,
      selectedProfile,
      profiles: profiles.map((profile) => ({
        ...profile,
        linkedProviderNames: findProvidersByProfile(providers, profile.name),
      })),
    },
  };
}
