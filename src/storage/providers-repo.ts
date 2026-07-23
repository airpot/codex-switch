import * as fs from "node:fs";
import { ProviderRecord } from "../domain/providers";
import { cliError, normalizeError } from "../domain/errors";
import { ProvidersFile, cleanProviderRecord, sortProviders, validateProvidersShape } from "../domain/providers";
import { readRequiredFile, writeTextFileAtomic } from "./fs-utils";

/**
 * Reads and validates providers.json from disk.
 */
export function readProvidersFile(providersPath: string): ProvidersFile {
  const raw = readRequiredFile(providersPath, "PROVIDERS_NOT_FOUND", "providers.json");
  try {
    return validateProvidersShape(JSON.parse(raw));
  } catch (error: unknown) {
    throw cliError("PROVIDERS_PARSE_ERROR", "Failed to parse providers.json.", {
      file: providersPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Reads providers.json when it exists, otherwise returns an empty registry.
 */
export function readProvidersFileIfExists(providersPath: string): ProvidersFile {
  return fs.existsSync(providersPath) ? readProvidersFile(providersPath) : { providers: {} };
}

/**
 * Persists providers.json using deterministic key ordering.
 */
export function writeProvidersFile(providersPath: string, providers: ProvidersFile): void {
  writeTextFileAtomic(providersPath, `${JSON.stringify(sortProviders(providers), null, 2)}\n`);
}

/**
 * Returns a single provider record or throws a typed not-found error.
 */
export function readProviderRecord(providersPath: string, providerName: string): ProviderRecord {
  const providers = readProvidersFile(providersPath);
  const record = providers.providers[providerName];
  if (!record) {
    throw cliError("PROVIDER_NOT_FOUND", `Provider "${providerName}" was not found.`, {
      provider: providerName,
      file: providersPath,
    });
  }

  return record;
}

/**
 * Merges imported providers into the current registry, preferring the imported side on conflicts.
 */
export function mergeProviders(current: ProvidersFile, imported: ProvidersFile): ProvidersFile {
  const providers: Record<string, ProviderRecord> = {};
  for (const [name, record] of Object.entries(current.providers)) {
    providers[name] = cleanProviderRecord(record);
  }
  for (const [name, record] of Object.entries(imported.providers)) {
    providers[name] = cleanProviderRecord(record);
  }

  return sortProviders({ providers });
}
