import { cliError } from "../domain/errors";
import { applyConfigMutation, createConfigMutationPlan, readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { buildModelProviderProjection } from "../domain/providers";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Removes a provider from the managed providers registry.
 */
export function removeProvider(args: {
  codexDir: string;
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  providerName: string;
  switchToProvider?: string | null;
}): CommandResult {
  const providers = readProvidersFile(args.providersPath);
  const document = readStructuredConfig(args.configPath);
  const current = providers.providers[args.providerName];
  if (!current) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`);
  }

  const nextProviders = { ...providers.providers };
  delete nextProviders[args.providerName];
  const activeModelProvider = document.currentModelProvider;
  const linkedProviders = Object.entries(providers.providers)
    .filter(([, provider]) => provider.profile === activeModelProvider)
    .map(([name]) => name)
    .sort();
  const removingActiveProvider = activeModelProvider === current.profile && linkedProviders.length === 1;
  const switchTargetName = args.switchToProvider ?? null;
  const switchTarget = switchTargetName ? nextProviders[switchTargetName] ?? null : null;

  if (removingActiveProvider && !switchTargetName) {
    throw cliError("PROFILE_IN_USE", `Provider "${args.providerName}" is the active route and requires --switch-to <provider-name>.`, {
      provider: args.providerName,
      activeModelProvider,
      linkedProviders,
    });
  }
  if (switchTargetName && !switchTarget) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${switchTargetName}" was not found.`, {
      provider: switchTargetName,
      availableProviders: Object.keys(nextProviders).sort(),
    });
  }
  const switchTargetModel = switchTarget?.model ?? document.currentModel ?? null;
  if (switchTargetName && !switchTargetModel) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${switchTargetName}" has no model to switch with.`, {
      provider: switchTargetName,
      suggestion: "Run `codexs edit <provider> --model <name>` first.",
    });
  }
  const switchTargetProjection = switchTarget
    ? switchTarget.baseUrl
      ? buildModelProviderProjection(switchTarget.profile, switchTarget.baseUrl)
      : null
    : null;
  if (switchTargetName && !switchTargetProjection) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${switchTargetName}" requires base_url before it can become active.`, {
      provider: switchTargetName,
      suggestion: "Run `codexs edit <provider> --base-url <url>` first.",
    });
  }

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "remove",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        setCurrentModel: switchTarget ? switchTargetModel : undefined,
        setCurrentModelProvider: switchTarget ? switchTarget.profile : undefined,
        upsertModelProviders: switchTarget && switchTargetProjection
          ? { [switchTarget.profile]: switchTargetProjection }
          : undefined,
        deleteLegacyProfile: Boolean(switchTarget),
        deleteLegacyProfilesByName: switchTarget ? [switchTarget.profile] : [],
        scrubModelProviderEnvKeys: switchTarget ? [switchTarget.profile] : [],
      });
      writeProvidersFile(args.providersPath, { providers: nextProviders });
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
        switchedTo: switchTargetName,
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: Boolean(switchTarget),
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
