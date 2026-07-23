import * as fs from "node:fs";
import { buildSetupDrafts, collectMigrateAdoptability, findIncompleteSetupProfiles, SetupProviderDetails } from "../domain/setup";
import { cliError } from "../domain/errors";
import { buildManagedProfileViews } from "../domain/config";
import { ProviderRecord } from "../domain/providers";
import { checkCodexAvailable, checkCodexVersion } from "../runtime/codex-cli";
import {
  applyConfigMutation,
  createConfigMutationPlan,
  readStructuredConfig,
} from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { mergeProviders, readProvidersFileIfExists, writeProvidersFile } from "../storage/providers-repo";
import { MIN_SUPPORTED_CODEX_VERSION } from "../runtime/codex-version";
import { runDoctor } from "./run-doctor";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Migrates unmanaged Codex config profiles into a managed providers.json registry.
 */
export async function migrateCodex(args: {
  codexDirOption?: string | null;
  codexDir: string;
  lockPath: string;
  configPath: string;
  providersPath: string;
  authPath: string;
  backupsDir: string;
  latestBackupPath: string;
  strategy: "merge" | "overwrite";
  adoptProfiles: string[];
  providerDetailsByProfile: Record<string, SetupProviderDetails>;
}): Promise<CommandResult> {
  const available = checkCodexAvailable();
  if (!available.ok) {
    throw cliError("CODEX_NOT_INSTALLED", "codex CLI is not available.", {
      cause: available.cause,
    });
  }

  const version = checkCodexVersion(MIN_SUPPORTED_CODEX_VERSION);
  if (!version.ok) {
    throw cliError("CODEX_VERSION_UNSUPPORTED", "codex CLI version is below the supported minimum.", {
      minimumVersion: MIN_SUPPORTED_CODEX_VERSION,
      currentVersion: version.currentVersion ?? null,
      cause: version.cause,
    });
  }

  if (!fs.existsSync(args.codexDir)) {
    throw cliError("CODEX_DIR_NOT_FOUND", "The requested Codex directory does not exist.", {
      codexDir: args.codexDir,
    });
  }

  const document = readStructuredConfig(args.configPath);
  const currentProviders = readProvidersFileIfExists(args.providersPath);
  const profileViews = buildManagedProfileViews(document, currentProviders);
  const adoptability = collectMigrateAdoptability(document, currentProviders);
  if (profileViews.length === 0) {
    throw cliError("PROFILE_NOT_FOUND", "No profiles were found in config.toml.", {
      file: args.configPath,
    });
  }
  if (adoptability.adoptableProfiles.length === 0) {
    throw cliError("MIGRATE_NO_ADOPTABLE_PROFILES", "No adoptable profiles were found for migrate.", {
      availableProfiles: adoptability.availableProfiles,
      adoptableProfiles: adoptability.adoptableProfiles,
      blockingReasonsByProfile: adoptability.blockingReasonsByProfile,
    });
  }

  const invalidAdoptProfiles = args.adoptProfiles.filter((profile) => !adoptability.adoptableProfiles.includes(profile));
  if (invalidAdoptProfiles.length > 0) {
    throw cliError("INVALID_ARGUMENT", "migrate only adopts unmanaged profiles that already contain model, model_provider, and matching model_providers base_url.", {
      invalidProfiles: invalidAdoptProfiles.sort(),
      availableProfiles: adoptability.availableProfiles,
      adoptableProfiles: adoptability.adoptableProfiles,
      blockingReasonsByProfile: adoptability.blockingReasonsByProfile,
    });
  }
  if (args.adoptProfiles.length === 0) {
    throw cliError("INVALID_ARGUMENT", "migrate requires at least one explicit profile to adopt.", {
      availableProfiles: adoptability.availableProfiles,
      adoptableProfiles: adoptability.adoptableProfiles,
      blockingReasonsByProfile: adoptability.blockingReasonsByProfile,
    });
  }

  const runtimeByProfile = profileViews.reduce<Record<string, { baseUrl?: string }>>((accumulator, view) => {
    if (view.source === "unmanaged") {
      accumulator[view.name] = {
        baseUrl: view.baseUrl ?? undefined,
      };
    }
    return accumulator;
  }, {});
  const drafts = buildSetupDrafts(args.adoptProfiles, args.providerDetailsByProfile, runtimeByProfile);
  const incompleteProfiles = findIncompleteSetupProfiles(drafts);
  if (incompleteProfiles.length > 0) {
    throw cliError("INVALID_ARGUMENT", "migrate requires complete provider data for every selected profile.", {
      incompleteProfiles,
    });
  }

  ensureDir(args.codexDir);
  const providersExists = fs.existsSync(args.providersPath);
  if (providersExists && args.strategy !== "merge" && args.strategy !== "overwrite") {
    throw cliError("PROVIDERS_ALREADY_EXISTS", "providers.json already exists.", {
      file: args.providersPath,
    });
  }

  const nextProviders = {
    providers: drafts.reduce<Record<string, ProviderRecord>>((accumulator, draft) => {
      accumulator[draft.providerName] = draft.record;
      return accumulator;
    }, {}),
  };

  const finalProviders = args.strategy === "merge" ? mergeProviders(currentProviders, nextProviders) : nextProviders;

  const result = runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "migrate",
    files: [
      { absolutePath: args.providersPath, relativePath: "providers.json" },
      { absolutePath: args.configPath, relativePath: "config.toml" },
    ],
    mutate: () => {
      // migrate currently preserves config structure and only asserts that the file remains writable inside the mutation flow.
      const configPlan = createConfigMutationPlan(document, {});
      writeProvidersFile(args.providersPath, finalProviders);
      applyConfigMutation(args.configPath, document, configPlan);
      return {
        codexDir: args.codexDir,
        strategy: args.strategy,
        providersInitialized: Object.keys(nextProviders.providers).length,
        providerNames: Object.keys(finalProviders.providers).sort(),
        createdProfileSections: configPlan.createdProfileSections,
        deletedProfileSections: configPlan.deletedProfileSections,
        keptSharedProfiles: [],
        switchedActiveProfile: false,
        adoptedProfiles: [...args.adoptProfiles].sort(),
        repairedProfiles: [],
      };
    },
  });

  // Re-run doctor on the final state so migrate returns immediate post-migration diagnostics.
  const doctor = await runDoctor({
    codexDir: args.codexDir,
    configPath: args.configPath,
    providersPath: args.providersPath,
    authPath: args.authPath,
  });

  return {
    data: {
      ...result.data,
      doctor: doctor.data,
    },
    warnings: doctor.warnings,
  };
}
