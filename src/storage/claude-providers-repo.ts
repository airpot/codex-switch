import * as fs from "node:fs";
import { cliError, normalizeError } from "../domain/errors";
import {
  ClaudeProvidersFile,
  ClaudeProviderRecord,
  sortClaudeProviders,
  validateClaudeProvidersShape,
} from "../domain/claude-providers";
import { writeTextFileAtomic } from "./fs-utils";

/**
 * Reads and validates claude-providers.json from disk.
 */
export function readClaudeProvidersFile(providersPath: string): ClaudeProvidersFile {
  if (!fs.existsSync(providersPath)) {
    throw cliError("CLAUDE_PROVIDERS_NOT_FOUND", "claude-providers.json not found. Run `codexs add --claude` first.", {
      file: providersPath,
    });
  }
  const raw = fs.readFileSync(providersPath, "utf8");
  try {
    return validateClaudeProvidersShape(JSON.parse(raw));
  } catch (error: unknown) {
    throw cliError("CLAUDE_PROVIDERS_PARSE_ERROR", "Failed to parse claude-providers.json.", {
      file: providersPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Reads claude-providers.json when it exists, otherwise returns an empty registry.
 */
export function readClaudeProvidersFileIfExists(providersPath: string): ClaudeProvidersFile {
  return fs.existsSync(providersPath) ? readClaudeProvidersFile(providersPath) : { providers: {} };
}

/**
 * Persists claude-providers.json using deterministic key ordering.
 */
export function writeClaudeProvidersFile(providersPath: string, providers: ClaudeProvidersFile): void {
  writeTextFileAtomic(providersPath, `${JSON.stringify(sortClaudeProviders(providers), null, 2)}\n`);
}

/**
 * Returns a single Claude provider record or throws a typed not-found error.
 */
export function readClaudeProviderRecord(providersPath: string, providerName: string): ClaudeProviderRecord {
  const providers = readClaudeProvidersFile(providersPath);
  const record = providers.providers[providerName];
  if (!record) {
    throw cliError("CLAUDE_PROVIDER_NOT_FOUND", `Claude provider "${providerName}" was not found.`, {
      provider: providerName,
      file: providersPath,
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }

  return record;
}

/**
 * Reads the current Claude Code settings.json from disk.
 */
export function readClaudeSettings(settingsPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Writes Claude Code settings.json atomically.
 */
export function writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  writeTextFileAtomic(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}
