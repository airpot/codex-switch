import * as fs from "node:fs";
import * as path from "node:path";
import { BackupManifest } from "../domain/backup";
import { cliError } from "../domain/errors";
import { getBackupId } from "../domain/backups";
import { inspectLiveStateDrift } from "../domain/runtime-state";
import { resolveCodexDir } from "../storage/codex-paths";
import { readStructuredConfig } from "../storage/config-repo";
import { readProvidersFile } from "../storage/providers-repo";
import { loadLatestManifest, loadManifestById } from "../storage/backup-repo";
import { promptTags } from "./add-interactive";
import { CliPromptRuntime } from "./prompt";

/**
 * Keeps CLI-side interactivity rules in one place so automation paths remain explicit.
 */
export function canPrompt(runtime: CliPromptRuntime, jsonMode: boolean): boolean {
  return !jsonMode && runtime.isInteractive();
}

/**
 * Prompts the user to choose one configured provider when a command omitted its target.
 */
export async function promptForProviderSelection(
  runtime: CliPromptRuntime,
  providersPath: string,
  configPath: string,
  message: string
): Promise<string> {
  const providers = readProvidersFile(providersPath);
  const document = fs.existsSync(configPath) ? readStructuredConfig(configPath) : null;
  const currentModelProvider = document?.currentModelProvider ?? null;
  const liveState = inspectLiveStateDrift(currentModelProvider, providers);
  const legacyCurrentProvider =
    !liveState.providerResolvable &&
    document?.legacyProfile &&
    providers.providers[document.legacyProfile]
      ? document.legacyProfile
      : null;
  const choices = Object.entries(providers.providers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerName, provider]) => {
      const currentMarker = liveState.providerResolvable && liveState.mappedProvider === providerName ? " | current" : "";
      const legacyMarker = !currentMarker && legacyCurrentProvider === providerName ? " | current" : "";
      const ambiguousMarker =
        !liveState.providerResolvable && liveState.mappedProviders.includes(providerName) ? " | current=ambiguous" : "";
      return {
        value: providerName,
        label: providerName,
        hint: `profile=${provider.profile}${currentMarker}${legacyMarker}${ambiguousMarker}`,
      };
    });

  if (choices.length === 0) {
    throw cliError("PROVIDER_NOT_FOUND", "No providers are configured.");
  }

  return runtime.selectOne(message, choices);
}

/**
 * Confirms destructive provider removal and turns a declined prompt into a typed cancellation.
 */
export async function confirmProviderRemoval(
  runtime: CliPromptRuntime,
  providerName: string
): Promise<void> {
  const confirmed = await runtime.confirmAction(`Remove provider "${providerName}"?`, {
    defaultValue: false,
  });
  if (!confirmed) {
    throw cliError("PROMPT_CANCELLED", `Removal cancelled for provider "${providerName}".`);
  }
}

/**
 * Confirms provider import semantics, including whether the file will merge or replace the registry.
 */
export async function confirmImport(runtime: CliPromptRuntime, sourceFile: string, merge = false): Promise<void> {
  const confirmed = await runtime.confirmAction(
    merge
      ? `Import providers from ${path.resolve(sourceFile)} and merge into the current registry?`
      : `Import providers from ${path.resolve(sourceFile)} and replace the current registry?`,
    { defaultValue: false }
  );
  if (!confirmed) {
    throw cliError("PROMPT_CANCELLED", "Import cancelled.");
  }
}

/**
 * Confirms whether an existing export target may be overwritten.
 */
export async function confirmExportOverwrite(
  runtime: CliPromptRuntime,
  targetFile: string
): Promise<boolean> {
  return runtime.confirmAction(`Overwrite existing export target ${path.resolve(targetFile)}?`, {
    defaultValue: false,
  });
}

/**
 * Resolves whether the export target already exists after normalizing to an absolute path.
 */
export function exportTargetExists(targetFile: string): boolean {
  return fs.existsSync(path.resolve(targetFile));
}

/**
 * Builds a rollback preview for the latest managed backup.
 */
export function getRollbackSummary(latestBackupPath: string): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const manifest = loadLatestManifest(latestBackupPath);
  return buildRollbackSummary(manifest);
}

/**
 * Builds a rollback preview for one explicit backup id.
 */
export function getRollbackSummaryById(backupsDir: string, backupId: string): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const manifest = loadManifestById(backupsDir, backupId);
  return buildRollbackSummary(manifest);
}

/**
 * Converts a backup manifest into the human preview shown before rollback confirmation.
 */
function buildRollbackSummary(manifest: BackupManifest): {
  manifest: BackupManifest;
  previewLines: string[];
} {
  const previewLines = [
    "Rollback preview",
    `Backup ID: ${getBackupId(manifest.backupDir)}`,
    `Backup: ${manifest.backupDir}`,
    ...manifest.files.map((file) => {
      const suffix = file.existed ? "restore" : "remove";
      return `- ${file.relativePath} (${suffix})`;
    }),
  ];

  return { manifest, previewLines };
}

/**
 * Prints the rollback preview and requires explicit confirmation before restore proceeds.
 */
export async function confirmRollback(
  runtime: CliPromptRuntime,
  latestBackupPath: string,
  backupsDir?: string,
  backupId?: string | null
): Promise<void> {
  const { previewLines } =
    backupId && backupsDir
      ? getRollbackSummaryById(backupsDir, backupId)
      : getRollbackSummary(latestBackupPath);
  for (const line of previewLines) {
    runtime.writeLine(line);
  }

  const confirmed = await runtime.confirmAction(
    backupId ? `Restore files from backup "${backupId}"?` : "Restore files from the latest backup?",
    {
      defaultValue: false,
    }
  );
  if (!confirmed) {
    throw cliError("PROMPT_CANCELLED", "Rollback cancelled.");
  }
}

/**
 * Prompts for setup merge strategy when providers.json already exists.
 */
export async function chooseSetupStrategy(runtime: CliPromptRuntime): Promise<"merge" | "overwrite" | "cancel"> {
  return runtime.selectOne("providers.json already exists. Choose a migrate strategy.", [
    { value: "merge", label: "merge", hint: "keep existing providers and override by imported names" },
    { value: "overwrite", label: "overwrite", hint: "replace the existing registry" },
    { value: "cancel", label: "cancel", hint: "abort migrate without writing" },
  ]);
}

/**
 * Resolves the Codex directory from discovered candidates or a manually entered path.
 */
export async function chooseCodexDir(
  runtime: CliPromptRuntime,
  candidates: string[]
): Promise<string> {
  if (candidates.length === 0) {
    const manual = (await runtime.inputText("Codex directory path")).trim();
    if (!manual) {
      throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory was provided.");
    }
    return resolveCodexDir(manual);
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const selected = await runtime.selectOne("Choose a Codex directory", [
    ...candidates.map((candidate) => ({
      value: candidate,
      label: candidate,
    })),
    {
      value: "__manual__",
      label: "Enter manually",
    },
  ]);

  if (selected !== "__manual__") {
    return selected;
  }

  const manual = (await runtime.inputText("Codex directory path")).trim();
  if (!manual) {
    throw cliError("CODEX_DIR_NOT_FOUND", "No Codex directory was provided.");
  }
  return resolveCodexDir(manual);
}

/**
 * Confirms whether a missing Codex directory should be created during init.
 */
export async function confirmCreateCodexDir(runtime: CliPromptRuntime, codexDir: string): Promise<boolean> {
  return runtime.confirmAction(`Create missing Codex directory ${codexDir}?`, {
    defaultValue: false,
  });
}

/**
 * Lets setup adopt a subset of unmanaged config profiles into providers.json.
 */
export async function chooseSetupProfiles(
  runtime: CliPromptRuntime,
  profiles: Array<{ name: string; model: string; baseUrl: string }>
): Promise<string[]> {
  if (profiles.length === 0) {
    return [];
  }

  return runtime.selectMany(
    "Choose unmanaged config profiles to adopt into providers.json.",
    profiles.map((profile) => ({
      value: profile.name,
      label: profile.name,
      hint: `${profile.model} | ${profile.baseUrl}`,
    }))
  );
}

/**
 * Collects provider metadata for each adopted config profile during setup.
 */
export async function collectSetupProviderDetails(
  runtime: CliPromptRuntime,
  profiles: string[],
  defaultsByProfile: Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }> = {}
): Promise<Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }>> {
  const result: Record<string, { providerName?: string; apiKey?: string; baseUrl?: string; note?: string; tags?: string[] }> = {};

  for (const profile of profiles) {
    const defaults = defaultsByProfile[profile] ?? {};
    const providerName = (await runtime.inputText(`Provider name for profile "${profile}"`, {
      defaultValue: defaults.providerName ?? profile,
    })).trim();
    const apiKey = await promptRequiredSecret(
      runtime,
      `API key for profile "${profile}"`,
      defaults.apiKey?.trim() || undefined
    );
    const baseUrl = (await runtime.inputText(`Base URL note for profile "${profile}" (optional)`, {
      defaultValue: defaults.baseUrl ?? "",
    })).trim();
    const note = (await runtime.inputText(`Note for profile "${profile}" (optional)`, {
      defaultValue: defaults.note ?? "",
    })).trim();
    const tags = await promptTags(runtime);

    result[profile] = {
      providerName: providerName || defaults.providerName || profile,
      apiKey,
      baseUrl: baseUrl || defaults.baseUrl || undefined,
      note: note || defaults.note || undefined,
      // Empty selections are omitted so downstream setup validation can distinguish unset from explicit data.
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  return result;
}

/**
 * Re-prompts until a required secret value is provided, optionally falling back to a non-empty default.
 */
async function promptRequiredSecret(runtime: CliPromptRuntime, label: string, defaultValue?: string): Promise<string> {
  while (true) {
    const value = (await runtime.inputSecret(label)).trim() || defaultValue || "";
    if (value.length > 0) {
      return value;
    }
    runtime.writeLine(`${label} is required.`);
  }
}

/**
 * Collects editable provider fields, preserving current values when prompts are left blank.
 */
export async function collectEditInput(
  runtime: CliPromptRuntime,
  current: { profile: string; apiKey: string; baseUrl?: string; note?: string; tags?: string[] }
): Promise<{
  profile: string;
  apiKey: string;
  baseUrl?: string;
  note?: string;
  tags?: string[];
}> {
  const profile = (await runtime.inputText("Profile", { defaultValue: current.profile })).trim();
  const apiKey = (await runtime.inputSecret("API key")).trim() || current.apiKey;
  const baseUrl = (await runtime.inputText("Base URL (optional)", { defaultValue: current.baseUrl ?? "" })).trim();
  const note = (await runtime.inputText("Note (optional)", { defaultValue: current.note ?? "" })).trim();
  const tags = await promptTags(runtime, current.tags ?? []);

  return {
    profile,
    apiKey,
    baseUrl: baseUrl || undefined,
    note: note || undefined,
    tags,
  };
}
