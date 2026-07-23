import * as os from "node:os";
import { cliError } from "./errors";
import { ProvidersFile } from "./providers";

export type ManagedProfileFields = {
  model: string;
  modelProvider: string;
};

/**
 * Runtime fields required for a managed model_providers section.
 */
export type ManagedModelProviderFields = {
  baseUrl: string;
  name: string;
  requiresOpenAiAuth: boolean;
  wireApi: string;
  streamIdleTimeoutMs?: number;
};

export type ManagedProfileView = {
  name: string;
  managed: boolean;
  isActive: boolean;
  linkedProviders: string[];
  model: string | null;
  modelProvider: string | null;
  baseUrl: string | null;
  managedFields: string[];
  source: "managed" | "unmanaged" | "orphaned-reference";
};

export type ConfigConsistencyIssue =
  | { code: "MODEL_MISSING"; modelProvider: string }
  | { code: "MODEL_PROVIDER_MISSING" }
  | { code: "MODEL_PROVIDER_SECTION_MISSING"; modelProvider: string }
  | { code: "MODEL_PROVIDER_BASE_URL_MISSING"; modelProvider: string }
  | { code: "LEGACY_PROFILE_SELECTOR"; profile: string }
  | { code: "LEGACY_PROFILE_SECTION"; profile: string }
  | { code: "LEGACY_MODEL_PROVIDER_ENV_KEY"; modelProvider: string; envKey: string | null }
  | {
      code: "PROVIDER_BASE_URL_MISMATCH";
      modelProvider: string;
      provider: string;
      providerBaseUrl: string;
      configBaseUrl: string;
    }
  | {
      code: "DESTRUCTIVE_REMOVE_BLOCKED";
      modelProvider: string;
      provider: string;
      activeModelProvider: string;
      linkedProviders: string[];
    };

export type ValueRange = {
  start: number;
  end: number;
};

export type RootFieldRef = {
  value: string;
  valueRange: ValueRange;
  lineRange: ValueRange;
};

export type ProfileSectionRef = {
  name: string;
  headerStart: number;
  sectionStart: number;
  sectionEnd: number;
  managedFieldInsertIndex: number;
  modelValueRange: ValueRange | null;
  modelProviderValueRange: ValueRange | null;
  model: string | null;
  modelProvider: string | null;
};

export type ModelProviderSectionRef = {
  name: string;
  sectionStart: number;
  sectionEnd: number;
  managedFieldInsertIndex: number;
  baseUrlValueRange: ValueRange | null;
  baseUrl: string | null;
  nameValueRange: ValueRange | null;
  providerName: string | null;
  requiresOpenAiAuthValueRange: ValueRange | null;
  requiresOpenAiAuth: boolean | null;
  wireApiValueRange: ValueRange | null;
  wireApi: string | null;
  streamIdleTimeoutMsValueRange: ValueRange | null;
  streamIdleTimeoutMs: number | null;
  envKeyValueRange: ValueRange | null;
  envKey: string | null;
  envKeyInstructionsValueRange: ValueRange | null;
  envKeyInstructions: string | null;
  envKeyLineRange: ValueRange | null;
  envKeyInstructionsLineRange: ValueRange | null;
};

export type ParsedConfigDocument = {
  rawText: string;
  lineEnding: "\n" | "\r\n";
  currentModel: string | null;
  currentModelRange: ValueRange | null;
  currentModelLineRange: ValueRange | null;
  currentModelProvider: string | null;
  currentModelProviderRange: ValueRange | null;
  currentModelProviderLineRange: ValueRange | null;
  legacyProfile: string | null;
  legacyProfileRange: ValueRange | null;
  legacyProfileLineRange: ValueRange | null;
  profiles: ProfileSectionRef[];
  modelProviders: ModelProviderSectionRef[];
};

export type ConfigPatchOperation =
  | { kind: "replace-range"; start: number; end: number; text: string }
  | { kind: "insert-at"; index: number; text: string }
  | { kind: "delete-range"; start: number; end: number };

export type ConfigMutationPlan = {
  operations: ConfigPatchOperation[];
  createdProfileSections: string[];
  createdModelProviderSections: string[];
  deletedProfileSections: string[];
  updatedProfiles: string[];
  updatedModelProviders: string[];
  switchedActiveProfile: boolean;
};

type ProfileLinkInfo = {
  linkedProviders: string[];
  managed: boolean;
};

/**
 * Reads the legacy top-level profile selector from config.toml content.
 */
export function parseTopLevelProfile(configContent: string): string | null {
  return parseStructuredConfig(configContent).legacyProfile;
}

/**
 * Collects all named legacy profile sections declared in config.toml content.
 */
export function parseProfileNames(configContent: string): Set<string> {
  return new Set(parseStructuredConfig(configContent).profiles.map((profile) => profile.name));
}

/**
 * Replaces or inserts the legacy top-level profile assignment while preserving the rest of the file.
 */
export function replaceTopLevelProfile(configContent: string, profile: string): string {
  const plan = planConfigMutation(parseStructuredConfig(configContent), { setLegacyProfile: profile });
  return applyPatchOperations(configContent, plan.operations);
}

/**
 * Parses the supported config.toml subset into a structured document with stable text ranges.
 */
export function parseStructuredConfig(configContent: string): ParsedConfigDocument {
  const lineEnding: "\n" | "\r\n" = configContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitWithOffsets(configContent);
  let currentModel: string | null = null;
  let currentModelRange: ValueRange | null = null;
  let currentModelLineRange: ValueRange | null = null;
  let currentModelProvider: string | null = null;
  let currentModelProviderRange: ValueRange | null = null;
  let currentModelProviderLineRange: ValueRange | null = null;
  let legacyProfile: string | null = null;
  let legacyProfileRange: ValueRange | null = null;
  let legacyProfileLineRange: ValueRange | null = null;
  const profiles: ProfileSectionRef[] = [];
  const modelProviders: ModelProviderSectionRef[] = [];
  let currentProfile: ProfileSectionRef | null = null;
  let currentModelProviderSection: ModelProviderSectionRef | null = null;
  let inRoot = true;

  for (const line of lines) {
    const trimmed = line.content.trim();
    const headerMatch = trimmed.match(/^\[profiles\.([^\]]+)\]$/);
    if (headerMatch) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
      }
      if (currentModelProviderSection) {
        currentModelProviderSection.sectionEnd = line.start;
        currentModelProviderSection = null;
      }
      currentProfile = {
        name: headerMatch[1],
        headerStart: line.start,
        sectionStart: line.start,
        sectionEnd: configContent.length,
        managedFieldInsertIndex: configContent.length,
        modelValueRange: null,
        modelProviderValueRange: null,
        model: null,
        modelProvider: null,
      };
      profiles.push(currentProfile);
      inRoot = false;
      continue;
    }

    const modelProviderHeaderMatch = trimmed.match(/^\[model_providers\.([^\]]+)\]$/);
    if (modelProviderHeaderMatch) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
        currentProfile = null;
      }
      if (currentModelProviderSection) {
        currentModelProviderSection.sectionEnd = line.start;
      }
      currentModelProviderSection = {
        name: modelProviderHeaderMatch[1],
        sectionStart: line.start,
        sectionEnd: configContent.length,
        managedFieldInsertIndex: configContent.length,
        baseUrlValueRange: null,
        baseUrl: null,
        nameValueRange: null,
        providerName: null,
        requiresOpenAiAuthValueRange: null,
        requiresOpenAiAuth: null,
        wireApiValueRange: null,
        wireApi: null,
        streamIdleTimeoutMsValueRange: null,
        streamIdleTimeoutMs: null,
        envKeyValueRange: null,
        envKey: null,
        envKeyInstructionsValueRange: null,
        envKeyInstructions: null,
        envKeyLineRange: null,
        envKeyInstructionsLineRange: null,
      };
      modelProviders.push(currentModelProviderSection);
      inRoot = false;
      continue;
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (currentProfile) {
        currentProfile.sectionEnd = line.start;
        currentProfile = null;
      }
      if (currentModelProviderSection) {
        currentModelProviderSection.sectionEnd = line.start;
        currentModelProviderSection = null;
      }
      inRoot = false;
      continue;
    }

    if (inRoot) {
      const modelMatch = matchKeyValueLine(line.content, "model");
      if (modelMatch && !currentModel) {
        currentModel = modelMatch.value;
        currentModelRange = toAbsoluteRange(line.start, modelMatch.valueStart, modelMatch.valueEnd);
        currentModelLineRange = { start: line.start, end: line.end };
      }
      const modelProviderMatch = matchKeyValueLine(line.content, "model_provider");
      if (modelProviderMatch && !currentModelProvider) {
        currentModelProvider = modelProviderMatch.value;
        currentModelProviderRange = toAbsoluteRange(line.start, modelProviderMatch.valueStart, modelProviderMatch.valueEnd);
        currentModelProviderLineRange = { start: line.start, end: line.end };
      }
      const profileMatch = matchKeyValueLine(line.content, "profile");
      if (profileMatch && !legacyProfile) {
        legacyProfile = profileMatch.value;
        legacyProfileRange = toAbsoluteRange(line.start, profileMatch.valueStart, profileMatch.valueEnd);
        legacyProfileLineRange = { start: line.start, end: line.end };
      }
    }

    if (currentProfile) {
      const modelMatch = matchKeyValueLine(line.content, "model");
      if (modelMatch) {
        currentProfile.model = modelMatch.value;
        currentProfile.modelValueRange = toAbsoluteRange(line.start, modelMatch.valueStart, modelMatch.valueEnd);
      }
      const modelProviderMatch = matchKeyValueLine(line.content, "model_provider");
      if (modelProviderMatch) {
        currentProfile.modelProvider = modelProviderMatch.value;
        currentProfile.modelProviderValueRange = toAbsoluteRange(line.start, modelProviderMatch.valueStart, modelProviderMatch.valueEnd);
      }
    }

    if (currentModelProviderSection) {
      const baseUrlMatch = matchKeyValueLine(line.content, "base_url");
      if (baseUrlMatch) {
        currentModelProviderSection.baseUrl = baseUrlMatch.value;
        currentModelProviderSection.baseUrlValueRange = toAbsoluteRange(line.start, baseUrlMatch.valueStart, baseUrlMatch.valueEnd);
      }
      const nameMatch = matchKeyValueLine(line.content, "name");
      if (nameMatch) {
        currentModelProviderSection.providerName = nameMatch.value;
        currentModelProviderSection.nameValueRange = toAbsoluteRange(line.start, nameMatch.valueStart, nameMatch.valueEnd);
      }
      const requiresOpenAiAuthMatch = matchBooleanKeyValueLine(line.content, "requires_openai_auth");
      if (requiresOpenAiAuthMatch) {
        currentModelProviderSection.requiresOpenAiAuth = requiresOpenAiAuthMatch.value;
        currentModelProviderSection.requiresOpenAiAuthValueRange = toAbsoluteRange(
          line.start,
          requiresOpenAiAuthMatch.valueStart,
          requiresOpenAiAuthMatch.valueEnd
        );
      }
      const wireApiMatch = matchKeyValueLine(line.content, "wire_api");
      if (wireApiMatch) {
        currentModelProviderSection.wireApi = wireApiMatch.value;
        currentModelProviderSection.wireApiValueRange = toAbsoluteRange(line.start, wireApiMatch.valueStart, wireApiMatch.valueEnd);
      }
      const streamIdleTimeoutMsMatch = matchNumberKeyValueLine(line.content, "stream_idle_timeout_ms");
      if (streamIdleTimeoutMsMatch) {
        currentModelProviderSection.streamIdleTimeoutMs = streamIdleTimeoutMsMatch.value;
        currentModelProviderSection.streamIdleTimeoutMsValueRange = toAbsoluteRange(
          line.start,
          streamIdleTimeoutMsMatch.valueStart,
          streamIdleTimeoutMsMatch.valueEnd
        );
      }
      const envKeyMatch = matchKeyValueLine(line.content, "env_key");
      if (envKeyMatch) {
        currentModelProviderSection.envKey = envKeyMatch.value;
        currentModelProviderSection.envKeyValueRange = toAbsoluteRange(line.start, envKeyMatch.valueStart, envKeyMatch.valueEnd);
        currentModelProviderSection.envKeyLineRange = { start: line.start, end: line.end };
      }
      const envKeyInstructionsMatch = matchKeyValueLine(line.content, "env_key_instructions");
      if (envKeyInstructionsMatch) {
        currentModelProviderSection.envKeyInstructions = envKeyInstructionsMatch.value;
        currentModelProviderSection.envKeyInstructionsValueRange = toAbsoluteRange(
          line.start,
          envKeyInstructionsMatch.valueStart,
          envKeyInstructionsMatch.valueEnd
        );
        currentModelProviderSection.envKeyInstructionsLineRange = { start: line.start, end: line.end };
      }
    }
  }

  return {
    rawText: configContent,
    lineEnding,
    currentModel,
    currentModelRange,
    currentModelLineRange,
    currentModelProvider,
    currentModelProviderRange,
    currentModelProviderLineRange,
    legacyProfile,
    legacyProfileRange,
    legacyProfileLineRange,
    profiles: profiles.map((profile) => ({
      ...profile,
      managedFieldInsertIndex: findManagedFieldInsertIndex(configContent, profile.sectionStart, profile.sectionEnd),
    })),
    modelProviders: modelProviders.map((provider) => ({
      ...provider,
      managedFieldInsertIndex: findManagedFieldInsertIndex(configContent, provider.sectionStart, provider.sectionEnd),
    })),
  };
}

/**
 * Builds the legacy profile inspection views used by config commands and diagnostics.
 */
export function buildManagedProfileViews(
  document: ParsedConfigDocument,
  providers: ProvidersFile | null
): ManagedProfileView[] {
  const linkMap = buildProfileLinkMap(providers);
  const modelProviderMap = new Map(document.modelProviders.map((provider) => [provider.name, provider]));
  const views: ManagedProfileView[] = [];
  const seen = new Set<string>();

  for (const section of document.profiles) {
    const linkInfo = linkMap.get(section.name) ?? { linkedProviders: [], managed: false };
    const modelProviderSection = section.modelProvider ? modelProviderMap.get(section.modelProvider) ?? null : null;
    seen.add(section.name);
    views.push({
      name: section.name,
      managed: linkInfo.managed,
      isActive: document.currentModelProvider === section.name,
      linkedProviders: [...linkInfo.linkedProviders].sort(),
      model: section.model,
      modelProvider: section.modelProvider,
      baseUrl: modelProviderSection?.baseUrl ?? null,
      managedFields: collectManagedFields(section.model, section.modelProvider),
      source: linkInfo.managed ? "managed" : "unmanaged",
    });
  }

  for (const [profile, linkInfo] of [...linkMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (seen.has(profile)) {
      continue;
    }
    views.push({
      name: profile,
      managed: true,
      isActive: document.currentModelProvider === profile,
      linkedProviders: [...linkInfo.linkedProviders].sort(),
      model: null,
      modelProvider: null,
      baseUrl: null,
      managedFields: [],
      source: "orphaned-reference",
    });
  }

  return views.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Collects structured config consistency issues for doctor and status.
 */
export function collectConfigConsistencyIssues(
  document: ParsedConfigDocument,
  providers: ProvidersFile | null
): ConfigConsistencyIssue[] {
  const issues: ConfigConsistencyIssue[] = [];
  const providerMap = providers?.providers ?? null;
  const activeModelProvider = document.currentModelProvider;
  const activeProviderSection = activeModelProvider
    ? document.modelProviders.find((entry) => entry.name === activeModelProvider) ?? null
    : null;

  if (!document.currentModel) {
    issues.push({ code: "MODEL_MISSING", modelProvider: activeModelProvider ?? "(none)" });
  }
  if (!document.currentModelProvider) {
    issues.push({ code: "MODEL_PROVIDER_MISSING" });
  }
  if (document.legacyProfile) {
    issues.push({ code: "LEGACY_PROFILE_SELECTOR", profile: document.legacyProfile });
  }
  for (const profile of document.profiles) {
    issues.push({ code: "LEGACY_PROFILE_SECTION", profile: profile.name });
  }
  if (activeModelProvider && !activeProviderSection) {
    issues.push({ code: "MODEL_PROVIDER_SECTION_MISSING", modelProvider: activeModelProvider });
  }
  if (activeModelProvider && activeProviderSection && !activeProviderSection.baseUrl) {
    issues.push({ code: "MODEL_PROVIDER_BASE_URL_MISSING", modelProvider: activeModelProvider });
  }
  if (activeProviderSection?.envKey) {
    issues.push({
      code: "LEGACY_MODEL_PROVIDER_ENV_KEY",
      modelProvider: activeProviderSection.name,
      envKey: activeProviderSection.envKey,
    });
  }
  if (activeModelProvider && providerMap) {
    const linkedProviders = Object.entries(providerMap)
      .filter(([, provider]) => provider.profile === activeModelProvider)
      .sort(([left], [right]) => left.localeCompare(right));
    if (linkedProviders.length === 1 && activeProviderSection?.baseUrl) {
      const [providerName, provider] = linkedProviders[0];
      if (
        typeof provider.baseUrl === "string" &&
        provider.baseUrl.trim() !== "" &&
        provider.baseUrl !== activeProviderSection.baseUrl
      ) {
        issues.push({
          code: "PROVIDER_BASE_URL_MISMATCH",
          modelProvider: activeModelProvider,
          provider: providerName,
          providerBaseUrl: provider.baseUrl,
          configBaseUrl: activeProviderSection.baseUrl,
        });
      }
    }
  }

  return issues.sort((left, right) => left.code.localeCompare(right.code));
}

/**
 * Ensures the minimal managed profile fields are available before a new legacy section is created.
 */
export function validateManagedProfileCreation(
  profile: string,
  fields: Partial<ManagedProfileFields>
): ManagedProfileFields {
  const model = fields.model?.trim() ?? "";
  const modelProvider = fields.modelProvider?.trim() ?? "";
  if (!model || !modelProvider) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Managed profile "${profile}" requires both model and model_provider.`, {
      profile,
      missingFields: [
        !model ? "model" : null,
        !modelProvider ? "model_provider" : null,
      ].filter((value): value is string => Boolean(value)),
    });
  }

  return {
    model,
    modelProvider,
  };
}

/**
 * Computes keep/delete/switch outcomes when a provider leaves or changes model-provider bindings.
 */
export function planProfileLifecycleOutcome(args: {
  providerName: string;
  oldProfile: string | null;
  newProfile: string | null;
  activeProfile: string | null;
  remainingLinksByProfile: Map<string, string[]>;
  switchToProfile?: string | null;
}): {
  deletedProfileSections: string[];
  keptSharedProfiles: string[];
  switchedActiveProfile: boolean;
  nextActiveProfile: string | null;
} {
  if (!args.oldProfile || args.oldProfile === args.newProfile) {
    return {
      deletedProfileSections: [],
      keptSharedProfiles: [],
      switchedActiveProfile: false,
      nextActiveProfile: args.activeProfile,
    };
  }

  const remainingLinks = args.remainingLinksByProfile.get(args.oldProfile) ?? [];
  if (remainingLinks.length > 0) {
    return {
      deletedProfileSections: [],
      keptSharedProfiles: [args.oldProfile],
      switchedActiveProfile: false,
      nextActiveProfile: args.activeProfile,
    };
  }

  if (args.activeProfile === args.oldProfile) {
    if (!args.switchToProfile) {
      throw cliError("PROFILE_IN_USE", `Profile "${args.oldProfile}" is still the active profile. Switch first before removing the last linked provider.`, {
        profile: args.oldProfile,
        provider: args.providerName,
        activeProfile: args.activeProfile,
        linkedProviders: [],
      });
    }

    return {
      deletedProfileSections: [args.oldProfile],
      keptSharedProfiles: [],
      switchedActiveProfile: true,
      nextActiveProfile: args.switchToProfile,
    };
  }

  return {
    deletedProfileSections: [args.oldProfile],
    keptSharedProfiles: [],
    switchedActiveProfile: false,
    nextActiveProfile: args.activeProfile,
  };
}

/**
 * Builds a text patch plan for route fields, legacy selectors, and provider-section mutations.
 */
export function planConfigMutation(
  document: ParsedConfigDocument,
  args: {
    setCurrentModel?: string | null;
    setCurrentModelProvider?: string | null;
    setLegacyProfile?: string | null;
    upsertProfiles?: Record<string, Partial<ManagedProfileFields>>;
    upsertModelProviders?: Record<string, Partial<ManagedModelProviderFields>>;
    deleteProfiles?: string[];
    deleteLegacyProfile?: boolean;
    deleteLegacyProfilesByName?: string[];
    scrubModelProviderEnvKeys?: string[];
  }
): ConfigMutationPlan {
  const operations: ConfigPatchOperation[] = [];
  const createdProfileSections: string[] = [];
  const createdModelProviderSections: string[] = [];
  const deletedProfileSections: string[] = [];
  const updatedProfiles: string[] = [];
  const updatedModelProviders: string[] = [];
  const sectionMap = new Map(document.profiles.map((profile) => [profile.name, profile]));
  const modelProviderSectionMap = new Map(document.modelProviders.map((entry) => [entry.name, entry]));

  planRootFieldMutation(document, "model", document.currentModel, document.currentModelRange, document.currentModelLineRange, args.setCurrentModel, operations);
  planRootFieldMutation(
    document,
    "model_provider",
    document.currentModelProvider,
    document.currentModelProviderRange,
    document.currentModelProviderLineRange,
    args.setCurrentModelProvider,
    operations
  );

  if (args.setLegacyProfile !== undefined) {
    planRootFieldMutation(
      document,
      "profile",
      document.legacyProfile,
      document.legacyProfileRange,
      document.legacyProfileLineRange,
      args.setLegacyProfile,
      operations
    );
  }

  if (args.deleteLegacyProfile && document.legacyProfileLineRange) {
    operations.push({
      kind: "delete-range",
      start: document.legacyProfileLineRange.start,
      end: expandLineDeletionStart(document.rawText, document.legacyProfileLineRange.start, document.legacyProfileLineRange.end),
    });
  }

  for (const profileName of [...(args.deleteProfiles ?? []), ...(args.deleteLegacyProfilesByName ?? [])]) {
    const section = sectionMap.get(profileName);
    if (!section) {
      continue;
    }
    operations.push({
      kind: "delete-range",
      start: section.sectionStart,
      end: expandDeletionEnd(document.rawText, section.sectionStart, section.sectionEnd),
    });
    deletedProfileSections.push(profileName);
  }

  for (const [profileName, fields] of Object.entries(args.upsertProfiles ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const section = sectionMap.get(profileName);
    if (!section) {
      const requiredFields = validateManagedProfileCreation(profileName, fields);
      const prefix = document.rawText.length > 0 && !document.rawText.endsWith(document.lineEnding)
        ? document.lineEnding
        : "";
      operations.push({
        kind: "insert-at",
        index: document.rawText.length,
        text:
          `${prefix}[profiles.${profileName}]${document.lineEnding}` +
          `model = ${JSON.stringify(requiredFields.model)}${document.lineEnding}` +
          `model_provider = ${JSON.stringify(requiredFields.modelProvider)}${document.lineEnding}`,
      });
      createdProfileSections.push(profileName);
      continue;
    }

    const sectionUpdated = planSectionFieldMutation(document, section, fields, operations);
    if (sectionUpdated) {
      updatedProfiles.push(profileName);
    }
  }

  for (const [profileName, fields] of Object.entries(args.upsertModelProviders ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const section = modelProviderSectionMap.get(profileName);
    if (!section) {
      const normalizedFields = normalizeManagedModelProviderFields(profileName, fields);
      const prefix = document.rawText.length > 0 && !document.rawText.endsWith(document.lineEnding)
        ? document.lineEnding
        : "";
      operations.push({
        kind: "insert-at",
        index: document.rawText.length,
        text:
          `${prefix}[model_providers.${profileName}]${document.lineEnding}` +
          `base_url = ${JSON.stringify(normalizedFields.baseUrl)}${document.lineEnding}` +
          `name = ${JSON.stringify(normalizedFields.name)}${document.lineEnding}` +
          `requires_openai_auth = ${String(normalizedFields.requiresOpenAiAuth)}${document.lineEnding}` +
          `wire_api = ${JSON.stringify(normalizedFields.wireApi)}${document.lineEnding}` +
          (normalizedFields.streamIdleTimeoutMs !== undefined
            ? `stream_idle_timeout_ms = ${String(normalizedFields.streamIdleTimeoutMs)}${document.lineEnding}`
            : ""),
      });
      createdModelProviderSections.push(profileName);
      continue;
    }

    const sectionUpdated = planModelProviderFieldMutation(document, section, normalizeManagedModelProviderFields(profileName, fields), operations);
    if (sectionUpdated) {
      updatedModelProviders.push(profileName);
    }
  }

  for (const profileName of args.scrubModelProviderEnvKeys ?? []) {
    const section = modelProviderSectionMap.get(profileName);
    if (!section) {
      continue;
    }
    if (section.envKeyLineRange) {
      operations.push({
        kind: "delete-range",
        start: section.envKeyLineRange.start,
        end: expandLineDeletionStart(document.rawText, section.envKeyLineRange.start, section.envKeyLineRange.end),
      });
    }
    if (section.envKeyInstructionsLineRange) {
      operations.push({
        kind: "delete-range",
        start: section.envKeyInstructionsLineRange.start,
        end: expandLineDeletionStart(document.rawText, section.envKeyInstructionsLineRange.start, section.envKeyInstructionsLineRange.end),
      });
    }
  }

  return {
    operations,
    createdProfileSections,
    createdModelProviderSections,
    deletedProfileSections,
    updatedProfiles,
    updatedModelProviders,
    switchedActiveProfile:
      Boolean(args.setCurrentModelProvider !== undefined && args.setCurrentModelProvider !== document.currentModelProvider) ||
      Boolean(args.setLegacyProfile !== undefined && args.setLegacyProfile !== document.legacyProfile),
  };
}

/**
 * Applies a patch plan to raw config text. Callers should sort by reverse offsets only once here.
 */
export function applyPatchOperations(rawText: string, operations: ConfigPatchOperation[]): string {
  const sorted = [...operations].sort((left, right) => getOperationStart(right) - getOperationStart(left));
  let nextText = rawText;
  for (const operation of sorted) {
    if (operation.kind === "replace-range") {
      nextText = `${nextText.slice(0, operation.start)}${operation.text}${nextText.slice(operation.end)}`;
      continue;
    }
    if (operation.kind === "delete-range") {
      nextText = `${nextText.slice(0, operation.start)}${nextText.slice(operation.end)}`;
      continue;
    }
    nextText = `${nextText.slice(0, operation.index)}${operation.text}${nextText.slice(operation.index)}`;
  }

  return nextText;
}

/**
 * Plans managed field updates for one legacy profile section.
 */
function planSectionFieldMutation(
  document: ParsedConfigDocument,
  section: ProfileSectionRef,
  fields: Partial<ManagedProfileFields>,
  operations: ConfigPatchOperation[]
): boolean {
  let updated = false;
  const modelText = fields.model !== undefined ? JSON.stringify(fields.model) : null;
  const modelProviderText = fields.modelProvider !== undefined ? JSON.stringify(fields.modelProvider) : null;
  const inserts: string[] = [];

  if (modelText !== null && section.modelValueRange) {
    if (section.model !== fields.model) {
      operations.push({
        kind: "replace-range",
        start: section.modelValueRange.start,
        end: section.modelValueRange.end,
        text: modelText,
      });
      updated = true;
    }
  } else if (modelText !== null && !section.modelValueRange) {
    inserts.push(`model = ${modelText}${document.lineEnding}`);
    updated = true;
  }

  if (modelProviderText !== null && section.modelProviderValueRange) {
    if (section.modelProvider !== fields.modelProvider) {
      operations.push({
        kind: "replace-range",
        start: section.modelProviderValueRange.start,
        end: section.modelProviderValueRange.end,
        text: modelProviderText,
      });
      updated = true;
    }
  } else if (modelProviderText !== null && !section.modelProviderValueRange) {
    inserts.push(`model_provider = ${modelProviderText}${document.lineEnding}`);
    updated = true;
  }

  if (inserts.length > 0) {
    operations.push({
      kind: "insert-at",
      index: section.managedFieldInsertIndex,
      text: inserts.join(""),
    });
  }

  return updated;
}

/**
 * Plans managed field updates for one model_providers section.
 */
function planModelProviderFieldMutation(
  document: ParsedConfigDocument,
  section: ModelProviderSectionRef,
  fields: ManagedModelProviderFields,
  operations: ConfigPatchOperation[]
): boolean {
  let updated = false;
  const baseUrlText = JSON.stringify(fields.baseUrl);
  const nameText = JSON.stringify(fields.name);
  const requiresOpenAiAuthText = String(fields.requiresOpenAiAuth);
  const wireApiText = JSON.stringify(fields.wireApi);
  const streamIdleTimeoutMsText = fields.streamIdleTimeoutMs !== undefined ? String(fields.streamIdleTimeoutMs) : null;
  const inserts: string[] = [];

  if (section.baseUrlValueRange) {
    if (section.baseUrl !== fields.baseUrl) {
      operations.push({
        kind: "replace-range",
        start: section.baseUrlValueRange.start,
        end: section.baseUrlValueRange.end,
        text: baseUrlText,
      });
      updated = true;
    }
  } else {
    inserts.push(`base_url = ${baseUrlText}`);
    updated = true;
  }

  if (section.nameValueRange) {
    if (section.providerName !== fields.name) {
      operations.push({
        kind: "replace-range",
        start: section.nameValueRange.start,
        end: section.nameValueRange.end,
        text: nameText,
      });
      updated = true;
    }
  } else {
    inserts.push(`name = ${nameText}`);
    updated = true;
  }

  if (section.requiresOpenAiAuthValueRange) {
    if (section.requiresOpenAiAuth !== fields.requiresOpenAiAuth) {
      operations.push({
        kind: "replace-range",
        start: section.requiresOpenAiAuthValueRange.start,
        end: section.requiresOpenAiAuthValueRange.end,
        text: requiresOpenAiAuthText,
      });
      updated = true;
    }
  } else {
    inserts.push(`requires_openai_auth = ${requiresOpenAiAuthText}`);
    updated = true;
  }

  if (section.wireApiValueRange) {
    if (section.wireApi !== fields.wireApi) {
      operations.push({
        kind: "replace-range",
        start: section.wireApiValueRange.start,
        end: section.wireApiValueRange.end,
        text: wireApiText,
      });
      updated = true;
    }
  } else {
    inserts.push(`wire_api = ${wireApiText}`);
    updated = true;
  }

  if (streamIdleTimeoutMsText !== null) {
    if (section.streamIdleTimeoutMsValueRange) {
      if (section.streamIdleTimeoutMs !== fields.streamIdleTimeoutMs) {
        operations.push({
          kind: "replace-range",
          start: section.streamIdleTimeoutMsValueRange.start,
          end: section.streamIdleTimeoutMsValueRange.end,
          text: streamIdleTimeoutMsText,
        });
        updated = true;
      }
    } else {
      inserts.push(`stream_idle_timeout_ms = ${streamIdleTimeoutMsText}`);
      updated = true;
    }
  }

  if (inserts.length > 0) {
    operations.push({
      kind: "insert-at",
      index: section.managedFieldInsertIndex,
      text: `${inserts.join(document.lineEnding)}${document.lineEnding}`,
    });
  }

  return updated;
}

function planRootFieldMutation(
  document: ParsedConfigDocument,
  key: string,
  currentValue: string | null,
  currentValueRange: ValueRange | null,
  currentLineRange: ValueRange | null,
  nextValue: string | null | undefined,
  operations: ConfigPatchOperation[]
): void {
  if (nextValue === undefined) {
    return;
  }
  if (nextValue === null) {
    if (currentLineRange) {
      operations.push({
        kind: "delete-range",
        start: currentLineRange.start,
        end: expandLineDeletionStart(document.rawText, currentLineRange.start, currentLineRange.end),
      });
    }
    return;
  }
  if (currentValueRange) {
    if (currentValue !== nextValue) {
      operations.push({
        kind: "replace-range",
        start: currentValueRange.start,
        end: currentValueRange.end,
        text: JSON.stringify(nextValue),
      });
    }
    return;
  }
  const insertAt = findTopLevelInsertIndex(document.rawText);
  operations.push({
    kind: "insert-at",
    index: insertAt,
    text: `${key} = ${JSON.stringify(nextValue)}${document.lineEnding}`,
  });
}

function normalizeManagedModelProviderFields(
  profileName: string,
  fields: Partial<ManagedModelProviderFields>
): ManagedModelProviderFields {
  const baseUrl = fields.baseUrl?.trim() ?? "";
  if (!baseUrl) {
    throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Model provider "${profileName}" requires base_url.`, {
      profile: profileName,
      modelProvider: profileName,
      missingFields: ["base_url"],
    });
  }
  return {
    baseUrl,
    name: fields.name?.trim() || profileName,
    requiresOpenAiAuth: fields.requiresOpenAiAuth ?? true,
    wireApi: fields.wireApi?.trim() || "responses",
    streamIdleTimeoutMs: fields.streamIdleTimeoutMs,
  };
}

function splitWithOffsets(value: string): Array<{ content: string; start: number; end: number }> {
  if (value.length === 0) {
    return [];
  }

  const result: Array<{ content: string; start: number; end: number }> = [];
  let index = 0;
  while (index < value.length) {
    let nextBreak = value.indexOf("\n", index);
    if (nextBreak === -1) {
      nextBreak = value.length;
    } else {
      nextBreak += 1;
    }
    result.push({
      content: value.slice(index, nextBreak).replace(/\r?\n$/, ""),
      start: index,
      end: nextBreak,
    });
    index = nextBreak;
  }
  return result;
}

function matchKeyValueLine(line: string, key: string): { value: string; valueStart: number; valueEnd: number } | null {
  const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(["'])(.*?)\\1\\s*(#.*)?$`));
  if (!match || match.index === undefined) {
    return null;
  }

  const value = match[2];
  const openingQuoteIndex = line.indexOf(match[1], match.index);
  if (openingQuoteIndex === -1) {
    return null;
  }
  const valueStart = openingQuoteIndex;
  const valueEnd = openingQuoteIndex + match[1].length + value.length + match[1].length;
  return {
    value,
    valueStart,
    valueEnd,
  };
}

function matchBooleanKeyValueLine(line: string, key: string): { value: boolean; valueStart: number; valueEnd: number } | null {
  const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(true|false)\\s*(#.*)?$`));
  if (!match || match.index === undefined) {
    return null;
  }

  const value = match[1] === "true";
  const valueStart = line.indexOf(match[1], match.index);
  if (valueStart === -1) {
    return null;
  }
  const valueEnd = valueStart + match[1].length;
  return {
    value,
    valueStart,
    valueEnd,
  };
}

function matchNumberKeyValueLine(line: string, key: string): { value: number; valueStart: number; valueEnd: number } | null {
  const match = line.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(\\d+)\\s*(#.*)?$`));
  if (!match || match.index === undefined) {
    return null;
  }

  const valueStart = line.indexOf(match[1], match.index);
  if (valueStart === -1) {
    return null;
  }
  return {
    value: Number(match[1]),
    valueStart,
    valueEnd: valueStart + match[1].length,
  };
}

function findManagedFieldInsertIndex(rawText: string, sectionStart: number, sectionEnd: number): number {
  const sectionText = rawText.slice(sectionStart, sectionEnd);
  const lines = splitWithOffsets(sectionText);
  let lastMeaningfulIndex = lines.length - 1;

  while (lastMeaningfulIndex >= 0) {
    const trimmed = lines[lastMeaningfulIndex].content.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      lastMeaningfulIndex -= 1;
      continue;
    }
    break;
  }

  if (lastMeaningfulIndex < 0) {
    return sectionEnd;
  }

  return sectionStart + lines[lastMeaningfulIndex].end;
}

function collectManagedFields(model: string | null, modelProvider: string | null): string[] {
  const fields: string[] = [];
  if (model !== null) {
    fields.push("model");
  }
  if (modelProvider !== null) {
    fields.push("model_provider");
  }
  return fields;
}

function buildProfileLinkMap(providers: ProvidersFile | null): Map<string, ProfileLinkInfo> {
  const map = new Map<string, ProfileLinkInfo>();
  for (const [providerName, provider] of Object.entries(providers?.providers ?? {})) {
    const current = map.get(provider.profile) ?? { linkedProviders: [], managed: true };
    current.linkedProviders.push(providerName);
    current.managed = true;
    map.set(provider.profile, current);
  }

  for (const value of map.values()) {
    value.linkedProviders.sort();
  }
  return map;
}

function getOperationStart(operation: ConfigPatchOperation): number {
  if (operation.kind === "insert-at") {
    return operation.index;
  }
  return operation.start;
}

function findTopLevelInsertIndex(rawText: string): number {
  const sectionMatch = rawText.match(/^\s*\[/m);
  return sectionMatch && sectionMatch.index !== undefined ? sectionMatch.index : rawText.length;
}

function expandDeletionEnd(rawText: string, sectionStart: number, sectionEnd: number): number {
  let end = sectionEnd;
  while (end < rawText.length && (rawText[end] === "\r" || rawText[end] === "\n")) {
    end += 1;
  }
  if (sectionStart > 0) {
    let cursor = sectionStart - 1;
    while (cursor >= 0 && (rawText[cursor] === "\r" || rawText[cursor] === "\n")) {
      cursor -= 1;
    }
    if (cursor < sectionStart - 1) {
      return end;
    }
  }
  return end;
}

function expandLineDeletionStart(rawText: string, start: number, end: number): number {
  let nextEnd = end;
  while (nextEnd < rawText.length && (rawText[nextEnd] === "\r" || rawText[nextEnd] === "\n")) {
    nextEnd += 1;
  }
  return nextEnd;
}

function toAbsoluteRange(lineStart: number, valueStart: number, valueEnd: number): ValueRange {
  return {
    start: lineStart + valueStart,
    end: lineStart + valueEnd,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEFAULT_LINE_ENDING = os.EOL === "\r\n" ? "\r\n" : "\n";
