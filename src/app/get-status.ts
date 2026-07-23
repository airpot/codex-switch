import * as fs from "node:fs";
import { buildManagedProfileViews, collectConfigConsistencyIssues } from "../domain/config";
import { inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { readAuthFileState } from "../storage/auth-repo";
import { CommandResult } from "./types";

/**
 * Reports the current on-disk runtime state and how it maps back to managed providers.
 */
export async function getStatus(
  codexDir: string,
  configPath: string,
  providersPath: string,
  authPath: string,
): Promise<CommandResult> {
  const configExists = fs.existsSync(configPath);
  const providersExists = fs.existsSync(providersPath);
  let currentModelProvider: string | null = null;
  let currentModel: string | null = null;
  const warnings: string[] = [];
  const providers = providersExists ? readProvidersFile(providersPath) : null;
  let configViews: ReturnType<typeof buildManagedProfileViews> = [];
  let consistencyIssues: ReturnType<typeof collectConfigConsistencyIssues> = [];
  const authState = readAuthFileState(authPath);

  if (configExists) {
    const document = readStructuredConfig(configPath);
    currentModel = document.currentModel;
    currentModelProvider = document.currentModelProvider;
    configViews = buildManagedProfileViews(document, providers);
    consistencyIssues = collectConfigConsistencyIssues(document, providers);
    if (!currentModelProvider) {
      warnings.push("config.toml exists but has no top-level model_provider.");
    }
  }

  const liveState = inspectLiveStateDrift(currentModelProvider, providers);
  const activeProviderCandidates = liveState.mappedProviders;

  if (liveState.canBackfillActiveProvider) {
    warnings.push("Current config profile is not mapped in providers.json. Backfill would be required before treating live state as managed.");
  }
  if (liveState.reason === "shared-profile") {
    warnings.push(
      `Current model provider "${currentModelProvider}" is shared by multiple providers in providers.json, so the active provider cannot be resolved uniquely.`
    );
  }

  return {
    warnings,
    data: {
      codexDir,
      configExists,
      providersExists,
      currentModelProvider,
      currentModelProviderMapped: liveState.modelProviderMapped,
      currentModel,
      provider: liveState.mappedProvider,
      activeProviderResolvable: liveState.providerResolvable,
      activeProviderCandidates,
      liveState,
      auth: authState,
      configProfiles: configViews,
      issues: consistencyIssues,
    },
  };
}
