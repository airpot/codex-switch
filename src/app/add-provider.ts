import {
  buildModelProviderProjection,
  cleanProviderRecord,
  DEFAULT_RESPONSES_COMPATIBILITY,
  ResponsesCompatibility,
} from "../domain/providers";
import { cliError } from "../domain/errors";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Adds a new provider record to the managed providers registry.
 */
export async function addProvider(args: {
  codexDir: string;
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  providerName: string;
  profile: string;
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
  note?: string | null;
  tags: string[];
  responsesCompatibility?: ResponsesCompatibility;
  createProfile?: boolean;
}): Promise<CommandResult> {
  ensureDir(args.codexDir);
  const providers = readProvidersFileIfExists(args.providersPath);
  if (providers.providers[args.providerName]) {
    throw cliError("INVALID_IMPORT_FILE", `Provider "${args.providerName}" already exists.`);
  }

  const document = readStructuredConfig(args.configPath);
  const existingModelProvider = document.modelProviders.find((entry) => entry.name === args.profile);
  const inheritedModel = document.currentModel ?? undefined;
  const providerModel = args.model ?? inheritedModel;
  if (!providerModel) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Provider "${args.providerName}" requires a model.`, {
      provider: args.providerName,
      modelProvider: args.profile,
      missingFields: ["model"],
      suggestion: "Pass `--model <name>` or set a top-level model in config.toml first.",
    });
  }

  const directBaseUrl = args.baseUrl;
  if ((!directBaseUrl || directBaseUrl.trim() === "") && !existingModelProvider) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${args.profile}" requires base_url.`, {
      profile: args.profile,
      modelProvider: args.profile,
      missingFields: ["base_url"],
    });
  }

  const upsertModelProviders = {
    [args.profile]: buildModelProviderProjection(
      args.profile,
      (directBaseUrl ?? existingModelProvider?.baseUrl ?? "").trim()
    ),
  };

  const next = {
    providers: {
      ...providers.providers,
      [args.providerName]: cleanProviderRecord({
        profile: args.profile,
        apiKey: args.apiKey,
        model: providerModel,
        baseUrl: args.baseUrl ?? undefined,
        note: args.note ?? undefined,
        tags: args.tags,
        responsesCompatibility: args.responsesCompatibility ?? DEFAULT_RESPONSES_COMPATIBILITY,
      }),
    },
  };

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "add",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertModelProviders,
        scrubModelProviderEnvKeys: [args.profile],
      });
      writeProvidersFile(args.providersPath, next);
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        provider: args.providerName,
        model: providerModel,
        modelProvider: args.profile,
        profile: args.profile,
        responsesCompatibility: args.responsesCompatibility ?? DEFAULT_RESPONSES_COMPATIBILITY,
        createdProfileSections: configPlan.createdProfileSections,
        createdModelProviderSections: configPlan.createdModelProviderSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: configPlan.switchedActiveProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
