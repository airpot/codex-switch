import * as fs from "node:fs";
import { CommandResult } from "./types";
import { inspectLiveStateDrift } from "../domain/runtime-state";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { resolveResponsesCompatibility, ResponsesCompatibility } from "../domain/providers";

export type ProviderListItem = {
  name: string;
  profile: string;
  modelProvider: string;
  model: string | null;
  isActive: boolean;
  note: string | null;
  tags: string[];
  responsesCompatibility: ResponsesCompatibility;
};

/**
 * Returns the sorted list of configured providers for display.
 */
export function listProviders(providersPath: string, configPath?: string): CommandResult {
  const providers = readProvidersFile(providersPath);
  const names = Object.keys(providers.providers).sort();
  const currentModelProvider =
    configPath && fs.existsSync(configPath)
      ? readStructuredConfig(configPath).currentModelProvider
      : null;
  const currentModel =
    configPath && fs.existsSync(configPath)
      ? readStructuredConfig(configPath).currentModel
      : null;
  const liveState = inspectLiveStateDrift(currentModelProvider, providers);
  const items: ProviderListItem[] = names.map((name) => ({
    name,
    profile: providers.providers[name].profile,
    modelProvider: providers.providers[name].profile,
    model: providers.providers[name].model ?? null,
    isActive: liveState.providerResolvable && liveState.mappedProvider === name,
    note: providers.providers[name].note ?? null,
    tags: providers.providers[name].tags ?? [],
    responsesCompatibility: resolveResponsesCompatibility(providers.providers[name]),
  }));

  return {
    data: {
      providers: items,
      count: items.length,
      currentModel,
      currentModelProvider,
      activeProvider: liveState.mappedProvider,
      activeProviderResolvable: liveState.providerResolvable,
      activeProviderCandidates: liveState.mappedProviders,
    },
  };
}
