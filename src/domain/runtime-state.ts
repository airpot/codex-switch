import { ProvidersFile } from "./providers";

/**
 * Describes whether the live config.toml model_provider route still maps back to providers.json.
 */
export type LiveStateDrift = {
  currentModelProvider: string | null;
  mappedProvider: string | null;
  mappedProviders: string[];
  modelProviderMapped: boolean;
  providerResolvable: boolean;
  canBackfillActiveProvider: boolean;
  reason:
    | "ok"
    | "shared-profile"
    | "config-missing"
    | "model-provider-missing"
    | "providers-missing"
    | "provider-unmapped";
};

/**
 * Compares the live active model_provider against managed providers to detect drift.
 */
export function inspectLiveStateDrift(
  currentModelProvider: string | null,
  providers: ProvidersFile | null
): LiveStateDrift {
  if (currentModelProvider === null) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders: [],
      modelProviderMapped: false,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: providers ? "model-provider-missing" : "config-missing",
    };
  }

  if (!providers) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders: [],
      modelProviderMapped: false,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: "providers-missing",
    };
  }

  const mappedProviders: string[] = [];
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (provider.profile === currentModelProvider) {
      mappedProviders.push(name);
    }
  }

  if (mappedProviders.length === 1) {
    return {
      currentModelProvider,
      mappedProvider: mappedProviders[0],
      mappedProviders,
      modelProviderMapped: true,
      providerResolvable: true,
      canBackfillActiveProvider: false,
      reason: "ok",
    };
  }

  if (mappedProviders.length > 1) {
    return {
      currentModelProvider,
      mappedProvider: null,
      mappedProviders,
      modelProviderMapped: true,
      providerResolvable: false,
      canBackfillActiveProvider: false,
      reason: "shared-profile",
    };
  }

  return {
    currentModelProvider,
    mappedProvider: null,
    mappedProviders: [],
    modelProviderMapped: false,
    providerResolvable: false,
    canBackfillActiveProvider: true,
    reason: "provider-unmapped",
  };
}
