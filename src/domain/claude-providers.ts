/**
 * Claude Code provider definition stored in claude-providers.json.
 */
export type ClaudeProviderRecord = {
  settings: Record<string, unknown>;
  note?: string;
  tags?: string[];
};

/**
 * Root claude-providers.json document shape.
 */
export type ClaudeProvidersFile = {
  providers: Record<string, ClaudeProviderRecord>;
};

/**
 * Validates and normalizes unknown JSON into the claude-providers.json domain model.
 */
export function validateClaudeProvidersShape(input: unknown): ClaudeProvidersFile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Root value must be an object.");
  }

  const providersValue = (input as { providers?: unknown }).providers;
  if (!providersValue || typeof providersValue !== "object" || Array.isArray(providersValue)) {
    throw new Error('Missing or invalid "providers" object.');
  }

  const providers: Record<string, ClaudeProviderRecord> = {};
  for (const [name, value] of Object.entries(providersValue)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Claude provider "${name}" must be an object.`);
    }

    const provider = value as Record<string, unknown>;
    if (!provider.settings || typeof provider.settings !== "object" || Array.isArray(provider.settings)) {
      throw new Error(`Claude provider "${name}" is missing a valid settings object.`);
    }
    if (provider.note !== undefined && typeof provider.note !== "string") {
      throw new Error(`Claude provider "${name}" has an invalid note.`);
    }
    if (
      provider.tags !== undefined &&
      (!Array.isArray(provider.tags) || provider.tags.some((tag) => typeof tag !== "string"))
    ) {
      throw new Error(`Claude provider "${name}" has invalid tags.`);
    }

    providers[name] = cleanClaudeProviderRecord({
      settings: provider.settings as Record<string, unknown>,
      note: provider.note as string | undefined,
      tags: provider.tags as string[] | undefined,
    });
  }

  return { providers };
}

/**
 * Trims optional fields and removes empty values from a Claude provider record.
 */
export function cleanClaudeProviderRecord(record: ClaudeProviderRecord): ClaudeProviderRecord {
  const next: ClaudeProviderRecord = {
    settings: record.settings,
  };

  if (record.note && record.note.trim() !== "") {
    next.note = record.note.trim();
  }
  if (record.tags && record.tags.length > 0) {
    next.tags = record.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  return next;
}

/**
 * Returns a copy of the Claude providers file with provider names sorted deterministically.
 */
export function sortClaudeProviders(providers: ClaudeProvidersFile): ClaudeProvidersFile {
  const orderedProviders = Object.keys(providers.providers)
    .sort()
    .reduce<Record<string, ClaudeProviderRecord>>((accumulator, key) => {
      accumulator[key] = providers.providers[key];
      return accumulator;
    }, {});

  return { providers: orderedProviders };
}

/**
 * Extracts a human-readable summary from Claude settings for display.
 */
export function summarizeClaudeSettings(settings: Record<string, unknown>): {
  model: string | null;
  baseUrl: string | null;
  theme: string | null;
} {
  const env = settings.env as Record<string, string> | undefined;
  return {
    model: (settings.model as string) ?? null,
    baseUrl: env?.ANTHROPIC_BASE_URL ?? null,
    theme: (settings.theme as string) ?? null,
  };
}

/**
 * Compares two Claude settings objects for identity (based on env + model fields).
 */
export function claudeSettingsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const envA = a.env as Record<string, string> | undefined;
  const envB = b.env as Record<string, string> | undefined;
  if ((a.model ?? null) !== (b.model ?? null)) {
    return false;
  }
  const baseUrlA = envA?.ANTHROPIC_BASE_URL ?? null;
  const baseUrlB = envB?.ANTHROPIC_BASE_URL ?? null;
  if (baseUrlA !== baseUrlB) {
    return false;
  }
  const haikuA = envA?.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? null;
  const haikuB = envB?.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? null;
  if (haikuA !== haikuB) {
    return false;
  }
  const sonnetA = envA?.ANTHROPIC_DEFAULT_SONNET_MODEL ?? null;
  const sonnetB = envB?.ANTHROPIC_DEFAULT_SONNET_MODEL ?? null;
  if (sonnetA !== sonnetB) {
    return false;
  }
  const opusA = envA?.ANTHROPIC_DEFAULT_OPUS_MODEL ?? null;
  const opusB = envB?.ANTHROPIC_DEFAULT_OPUS_MODEL ?? null;
  if (opusA !== opusB) {
    return false;
  }
  return true;
}
