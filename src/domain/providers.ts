export type ModelProviderProjection = {
  baseUrl: string;
  name: string;
  requiresOpenAiAuth: true;
  wireApi: "responses";
};

/** Supported request-normalization policies for native Responses upstreams. */
export const RESPONSES_COMPATIBILITY_MODES = ["native", "strict", "xai"] as const;

/** Provider-scoped compatibility mode applied by the automatic router. */
export type ResponsesCompatibility = (typeof RESPONSES_COMPATIBILITY_MODES)[number];

/** Default policy for third-party relays managed by codex-switch. */
export const DEFAULT_RESPONSES_COMPATIBILITY: ResponsesCompatibility = "strict";

/**
 * Provider definition stored in providers.json.
 */
export type ProviderRecord = {
  profile: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
  responsesCompatibility?: ResponsesCompatibility;
};

/**
 * Root providers.json document shape.
 */
export type ProvidersFile = {
  providers: Record<string, ProviderRecord>;
};

/**
 * Validates and normalizes unknown JSON into the providers.json domain model.
 */
export function validateProvidersShape(input: unknown): ProvidersFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Root value must be an object.");
  }

  const providersValue = (input as { providers?: unknown }).providers;
  if (!providersValue || typeof providersValue !== "object" || Array.isArray(providersValue)) {
    throw new Error('Missing or invalid "providers" object.');
  }

  const providers: Record<string, ProviderRecord> = {};
  for (const [name, value] of Object.entries(providersValue)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Provider "${name}" must be an object.`);
    }

    const provider = value as Record<string, unknown>;
    if (typeof provider.profile !== "string" || provider.profile.trim() === "") {
      throw new Error(`Provider "${name}" is missing a valid profile.`);
    }
    if (typeof provider.apiKey !== "string" || provider.apiKey.trim() === "") {
      throw new Error(`Provider "${name}" is missing a valid apiKey.`);
    }

    if (provider.model !== undefined && typeof provider.model !== "string") {
      throw new Error(`Provider "${name}" has an invalid model.`);
    }
    if (provider.baseUrl !== undefined && typeof provider.baseUrl !== "string") {
      throw new Error(`Provider "${name}" has an invalid baseUrl.`);
    }
    if (provider.note !== undefined && typeof provider.note !== "string") {
      throw new Error(`Provider "${name}" has an invalid note.`);
    }
    if (
      provider.tags !== undefined &&
      (!Array.isArray(provider.tags) || provider.tags.some((tag) => typeof tag !== "string"))
    ) {
      throw new Error(`Provider "${name}" has invalid tags.`);
    }
    if (
      provider.responsesCompatibility !== undefined &&
      !isResponsesCompatibility(provider.responsesCompatibility)
    ) {
      throw new Error(`Provider "${name}" has an invalid responsesCompatibility.`);
    }

    providers[name] = cleanProviderRecord({
      profile: provider.profile,
      apiKey: provider.apiKey,
      model: provider.model as string | undefined,
      baseUrl: provider.baseUrl as string | undefined,
      note: provider.note as string | undefined,
      tags: provider.tags as string[] | undefined,
      responsesCompatibility: provider.responsesCompatibility as ResponsesCompatibility | undefined,
    });
  }

  return { providers };
}

/**
 * Trims optional fields and removes empty values from a provider record.
 */
export function cleanProviderRecord(record: ProviderRecord): ProviderRecord {
  const next: ProviderRecord = {
    profile: record.profile.trim(),
    apiKey: record.apiKey.trim(),
  };

  if (record.model && record.model.trim() !== "") {
    next.model = record.model.trim();
  }
  if (record.baseUrl && record.baseUrl.trim() !== "") {
    next.baseUrl = record.baseUrl.trim();
  }
  if (record.note && record.note.trim() !== "") {
    next.note = record.note.trim();
  }
  if (record.tags && record.tags.length > 0) {
    next.tags = record.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  if (record.responsesCompatibility) {
    next.responsesCompatibility = record.responsesCompatibility;
  }

  return next;
}

/**
 * Resolves the Responses compatibility policy for a provider record.
 */
export function resolveResponsesCompatibility(record: ProviderRecord): ResponsesCompatibility {
  return record.responsesCompatibility ?? DEFAULT_RESPONSES_COMPATIBILITY;
}

/**
 * Checks whether an unknown value is a supported Responses compatibility mode.
 */
export function isResponsesCompatibility(value: unknown): value is ResponsesCompatibility {
  return typeof value === "string" && RESPONSES_COMPATIBILITY_MODES.includes(value as ResponsesCompatibility);
}

/**
 * Returns a copy of the providers file with provider names sorted deterministically.
 */
export function sortProviders(providers: ProvidersFile): ProvidersFile {
  const orderedProviders = Object.keys(providers.providers)
    .sort()
    .reduce<Record<string, ProviderRecord>>((accumulator, key) => {
      accumulator[key] = providers.providers[key];
      return accumulator;
    }, {});

  return { providers: orderedProviders };
}

/**
 * Finds the provider name associated with a given Codex profile.
 */
export function findProviderByProfile(providers: ProvidersFile, profile: string): string | null {
  const matches = findProvidersByProfile(providers, profile);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Returns all provider names associated with a given Codex profile.
 */
export function findProvidersByProfile(providers: ProvidersFile, profile: string): string[] {
  const matches: string[] = [];
  for (const [name, provider] of Object.entries(providers.providers)) {
    if (provider.profile === profile) {
      matches.push(name);
    }
  }

  return matches.sort();
}

/**
 * Masks a secret for human-readable output while preserving a short fingerprint.
 */
export function maskSecret(value: string): string {
  if (value.length <= 5) {
    return "*".repeat(Math.max(value.length, 1));
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

/**
 * Builds the Codex-facing custom model_provider projection for a provider.
 */
export function buildModelProviderProjection(profile: string, baseUrl: string): ModelProviderProjection {
  const normalizedBaseUrl = baseUrl.trim();
  if (!normalizedBaseUrl) {
    throw new Error(`Model provider "${profile}" requires a non-empty base_url.`);
  }

  return {
    baseUrl: normalizedBaseUrl,
    name: profile.trim(),
    requiresOpenAiAuth: true,
    wireApi: "responses",
  };
}
