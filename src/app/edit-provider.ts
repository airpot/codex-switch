import { cliError } from "../domain/errors";
import {
  buildModelProviderProjection,
  cleanProviderRecord,
  ResponsesCompatibility,
} from "../domain/providers";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Updates selected fields on a single managed provider.
 */
export function editProvider(args: {
  codexDir: string;
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  configPath: string;
  authPath: string;
  providerName: string;
  profile?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  note?: string | null;
  tags?: string[] | null;
  responsesCompatibility?: ResponsesCompatibility;
  createProfile?: boolean;
  switchToProfile?: string | null;
}): CommandResult {
  ensureDir(args.codexDir);
  const providers = readProvidersFile(args.providersPath);
  const document = readStructuredConfig(args.configPath);
  const current = providers.providers[args.providerName];
  if (!current) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${args.providerName}" was not found.`, {
      provider: args.providerName,
      file: args.providersPath,
    });
  }

  const updatedFields: string[] = [];
  const nextProfile = args.profile ?? current.profile;
  const nextModel = args.model === null ? undefined : args.model ?? current.model;

  if (args.profile !== undefined && args.profile !== current.profile) {
    updatedFields.push("profile");
  }
  if (args.apiKey !== undefined && args.apiKey !== current.apiKey) {
    updatedFields.push("apiKey");
  }
  if (args.baseUrl !== undefined && (args.baseUrl ?? undefined) !== current.baseUrl) {
    updatedFields.push("baseUrl");
  }
  if (args.model !== undefined && args.model !== current.model) {
    updatedFields.push("model");
  }
  if (args.note !== undefined && (args.note ?? undefined) !== current.note) {
    updatedFields.push("note");
  }
  if (args.tags !== undefined) {
    updatedFields.push("tags");
  }
  if (args.responsesCompatibility !== undefined && args.responsesCompatibility !== current.responsesCompatibility) {
    updatedFields.push("responsesCompatibility");
  }

  const oldProfile = current.profile;
  const newProfile = nextProfile;
  const targetModelProviderSection = document.modelProviders.find((entry) => entry.name === newProfile) ?? null;
  const resolvedBaseUrl = (args.baseUrl ?? current.baseUrl ?? targetModelProviderSection?.baseUrl ?? "").trim();

  if (!resolvedBaseUrl) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${newProfile}" requires base_url.`, {
      profile: newProfile,
      modelProvider: newProfile,
      missingFields: ["base_url"],
    });
  }

  const upsertModelProviders = {
    [newProfile]: buildModelProviderProjection(newProfile, resolvedBaseUrl),
  };

  const nextRecord = cleanProviderRecord({
    profile: newProfile,
    apiKey: args.apiKey ?? current.apiKey,
    model: nextModel,
    baseUrl: args.baseUrl === null ? undefined : args.baseUrl ?? current.baseUrl,
    note: args.note === null ? undefined : args.note ?? current.note,
    tags: args.tags ?? current.tags,
    responsesCompatibility: args.responsesCompatibility ?? current.responsesCompatibility,
  });
  const isActive = document.currentModelProvider === oldProfile;

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "edit",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      const configPlan = createConfigMutationPlan(document, {
        upsertModelProviders,
        setCurrentModel: isActive ? nextModel ?? document.currentModel : undefined,
        setCurrentModelProvider: isActive ? newProfile : undefined,
        deleteLegacyProfile: isActive,
        deleteLegacyProfilesByName: isActive ? [newProfile] : [],
        scrubModelProviderEnvKeys: [newProfile],
      });
      const nextProviders = {
        providers: {
          ...providers.providers,
          [args.providerName]: nextRecord,
        },
      };
      writeProvidersFile(args.providersPath, nextProviders);
      applyConfigMutation(args.configPath, document, configPlan);

      return {
        provider: args.providerName,
        modelProvider: newProfile,
        updatedFields,
        createdProfileSections: configPlan.createdProfileSections,
        createdModelProviderSections: configPlan.createdModelProviderSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: isActive && newProfile !== oldProfile,
        adoptedProfiles: [],
        repairedProfiles: [],
      };
    },
  });
}
