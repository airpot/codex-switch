import { buildManagedProfileViews, ParsedConfigDocument } from "./config";
import { cleanProviderRecord, ProviderRecord, ProvidersFile } from "./providers";

export type SetupProviderDraft = {
  providerName: string;
  record: ProviderRecord;
};

export type SetupProviderDetails = {
  providerName?: string;
  apiKey?: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
};

export type MigrateAdoptableProfile = {
  name: string;
  model: string;
  modelProvider: string;
  baseUrl: string;
};

export type MigrateAdoptabilityReport = {
  availableProfiles: string[];
  adoptableProfiles: string[];
  blockingReasonsByProfile: Record<string, string[]>;
  adoptableProfileDetails: MigrateAdoptableProfile[];
};

/**
 * Creates initial provider drafts from config profile names.
 */
export function buildSetupDrafts(
  profiles: string[],
  detailsByProfile: Record<string, SetupProviderDetails>,
  runtimeByProfile: Record<string, { baseUrl?: string; model?: string; modelProvider?: string }>
): SetupProviderDraft[] {
  return profiles.map((profile) => {
    const detail = detailsByProfile[profile] ?? {};
    const runtime = runtimeByProfile[profile];
    const providerName = (detail.providerName ?? profile).trim();
    return {
      providerName,
      record: cleanProviderRecord({
        profile: runtime?.modelProvider ?? profile,
        apiKey: detail.apiKey ?? "",
        model: runtime?.model,
        baseUrl: detail.baseUrl ?? runtime?.baseUrl,
        note: detail.note,
        tags: detail.tags,
      }),
    };
  });
}

/**
 * Returns the profile names that still lack required provider fields.
 */
export function findIncompleteSetupProfiles(drafts: SetupProviderDraft[]): string[] {
  return drafts.filter((draft) => draft.record.apiKey.trim() === "").map((draft) => draft.record.profile);
}

/**
 * Collects the unmanaged profiles that can be safely adopted by migrate.
 */
export function collectMigrateAdoptability(document: ParsedConfigDocument, providers: ProvidersFile | null): MigrateAdoptabilityReport {
  const views = buildManagedProfileViews(document, providers)
    .filter((view) => view.source !== "orphaned-reference")
    .sort((left, right) => left.name.localeCompare(right.name));
  const modelProvidersByName = new Map(document.modelProviders.map((provider) => [provider.name, provider]));
  const availableProfiles = views.map((view) => view.name);
  const adoptableProfileDetails: MigrateAdoptableProfile[] = [];
  const blockingReasonsByProfile: Record<string, string[]> = {};

  for (const view of views) {
    const reasons: string[] = [];

    if (!view.model) {
      reasons.push("model is missing.");
    }
    if (!view.modelProvider) {
      reasons.push("model_provider is missing.");
    } else {
      if (view.modelProvider !== view.name) {
        reasons.push(`model_provider must match the profile name "${view.name}".`);
      }
      const modelProviderSection = modelProvidersByName.get(view.modelProvider);
      if (!modelProviderSection) {
        reasons.push(`model_providers.${view.modelProvider} section is missing.`);
      } else {
        if (!modelProviderSection.baseUrl) {
          reasons.push(`model_providers.${view.modelProvider}.base_url is missing.`);
        }
      }
    }

    if (view.source !== "unmanaged") {
      reasons.push("profile is already managed by providers.json.");
    }

    if (reasons.length === 0) {
      adoptableProfileDetails.push({
        name: view.name,
        model: view.model!,
        modelProvider: view.modelProvider!,
        baseUrl: view.baseUrl!,
      });
      continue;
    }

    blockingReasonsByProfile[view.name] = reasons;
  }

  return {
    availableProfiles,
    adoptableProfiles: adoptableProfileDetails.map((profile) => profile.name),
    blockingReasonsByProfile,
    adoptableProfileDetails,
  };
}
