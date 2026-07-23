import { cliError } from "../domain/errors";
import { CliPromptRuntime } from "./prompt";

export const COMMON_TAG_CHOICES = ["free", "paid", "daily", "backup"] as const;

type AddPromptDefaults = {
  providerName?: string | null;
  profile?: string | null;
  apiKey?: string | null;
  model?: string | null;
  baseUrl?: string | null;
  note?: string | null;
  tags: string[];
};

type PromptedAddInput = {
  providerName: string;
  profile: string;
  apiKey: string;
  createProfile: boolean;
  model?: string | null;
  baseUrl?: string | null;
  note?: string | null;
  tags: string[];
};


/**
 * Collects add command inputs interactively when required values are missing.
 */
export async function collectAddInput(
  runtime: CliPromptRuntime,
  defaults: AddPromptDefaults,
  providerExists: (providerName: string) => boolean,
  profileExists: (profileName: string) => boolean
): Promise<PromptedAddInput> {
  runtime.writeLine("Interactive add mode");
  runtime.writeLine("Provide the missing required fields. Press Enter to skip optional fields.");

  const providerName = defaults.providerName
    ? normalizeRequiredValue(defaults.providerName)
    : await promptProviderName(runtime, providerExists);
  const profile = defaults.profile ? normalizeRequiredValue(defaults.profile) : await promptRequiredValue(runtime, "Profile");
  const apiKey = defaults.apiKey
    ? normalizeRequiredValue(defaults.apiKey)
    : await promptConfirmedSecret(runtime, "API key", "Confirm API key");
  const createProfile = !profileExists(profile);
  const model = createProfile ? await promptRequiredValue(runtime, `Model for new profile "${profile}"`) : null;
  const baseUrl = createProfile
    ? (defaults.baseUrl ? normalizeRequiredValue(defaults.baseUrl) : await promptRequiredValue(runtime, `Base URL for new profile "${profile}"`))
    : defaults.baseUrl ?? normalizeOptionalValue(await runtime.inputText("Base URL (optional)"));
  const note = defaults.note ?? normalizeOptionalValue(await runtime.inputText("Note (optional)"));
  const tags = defaults.tags.length > 0 ? defaults.tags : await promptTags(runtime);

  return {
    providerName,
    profile,
    apiKey,
    createProfile,
    model,
    baseUrl,
    note,
    tags,
  };
}

/**
 * Throws a consistent error when interactive add is unavailable.
 */
export function createNonInteractiveAddError(): Error {
  return cliError(
    "INVALID_ARGUMENT",
    "add requires <provider>, --profile, and --api-key when running without an interactive TTY.",
    {
      suggestion: "Run in a terminal TTY or pass all required values explicitly.",
    }
  );
}

async function promptProviderName(
  runtime: CliPromptRuntime,
  providerExists: (providerName: string) => boolean
): Promise<string> {
  while (true) {
    const providerName = await promptRequiredValue(runtime, "Provider name");
    if (providerExists(providerName)) {
      runtime.writeLine(`Provider "${providerName}" already exists. Choose a different name.`);
      continue;
    }
    return providerName;
  }
}

async function promptRequiredValue(runtime: CliPromptRuntime, label: string): Promise<string> {
  while (true) {
    const value = normalizeRequiredValue(await runtime.inputText(label));
    if (value.length > 0) {
      return value;
    }
    runtime.writeLine(`${label} is required.`);
  }
}

async function promptConfirmedSecret(
  runtime: CliPromptRuntime,
  label: string,
  confirmationLabel: string
): Promise<string> {
  while (true) {
    const first = normalizeRequiredValue(await runtime.inputSecret(label));
    if (first.length === 0) {
      runtime.writeLine(`${label} is required.`);
      continue;
    }

    const second = normalizeRequiredValue(await runtime.inputSecret(confirmationLabel));
    if (second.length === 0) {
      runtime.writeLine(`${confirmationLabel} is required.`);
      continue;
    }

    if (first !== second) {
      runtime.writeLine("API key entries did not match. Try again.");
      continue;
    }

    return first;
  }
}

function normalizeRequiredValue(value: string): string {
  return value.trim();
}

function normalizeOptionalValue(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export async function promptTags(runtime: CliPromptRuntime, defaults: string[] = []): Promise<string[]> {
  const defaultPresetTags = defaults.filter(isCommonTag);
  return runtime.selectMany(
    "Select tags (optional)",
    COMMON_TAG_CHOICES.map((tag) => ({ value: tag, label: tag })),
    { defaultValues: defaultPresetTags }
  );
}

function isCommonTag(tag: string): tag is (typeof COMMON_TAG_CHOICES)[number] {
  return COMMON_TAG_CHOICES.includes(tag as (typeof COMMON_TAG_CHOICES)[number]);
}
