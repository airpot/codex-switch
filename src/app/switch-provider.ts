import { cliError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { writeOpenAiApiKeyAuth } from "../storage/auth-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";
import { buildModelProviderProjection } from "../domain/providers";

/**
 * Switches the active Codex route to the target provider.
 */
export async function switchProvider(args: {
  codexDir: string;
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  providerName: string;
}): Promise<CommandResult> {
  const providers = readProvidersFile(args.providersPath);
  const provider = providers.providers[args.providerName];
  if (!provider) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  const document = readStructuredConfig(args.configPath);
  const providerProfileSection = document.profiles.find((entry) => entry.name === provider.profile) ?? null;
  const providerModelProviderSection = document.modelProviders.find((entry) => entry.name === provider.profile) ?? null;
  const resolvedModel = provider.model ?? providerProfileSection?.model ?? document.currentModel;
  if (!resolvedModel) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" has no model to switch with.`, {
      provider: args.providerName,
      modelProvider: provider.profile,
      suggestion: "Run `codexs edit <provider> --model <name>` or `codexs add <provider> --model <name>`.",
    });
  }

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "switch",
    files: [
      { absolutePath: args.authPath, relativePath: "auth.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const directBaseUrl = provider.baseUrl?.trim() ?? "";
      const resolvedBaseUrl = directBaseUrl || providerModelProviderSection?.baseUrl?.trim() || "";
      if (!resolvedBaseUrl) {
        throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" requires base_url before switching.`, {
          provider: args.providerName,
          modelProvider: provider.profile,
          suggestion: "Run `codexs edit <provider> --base-url <url>`.",
        });
      }
      const configPlan = createConfigMutationPlan(document, {
        setCurrentModel: resolvedModel,
        setCurrentModelProvider: provider.profile,
        upsertModelProviders: {
          [provider.profile]: buildModelProviderProjection(provider.profile, resolvedBaseUrl),
        },
        deleteLegacyProfile: true,
        deleteLegacyProfilesByName: [provider.profile],
        scrubModelProviderEnvKeys: [provider.profile],
      });
      applyConfigMutation(args.configPath, document, configPlan);
      writeOpenAiApiKeyAuth(args.authPath, provider.apiKey);
      return {
        provider: args.providerName,
        model: resolvedModel,
        modelProvider: provider.profile,
        profile: provider.profile,
      };
    },
  });
}
