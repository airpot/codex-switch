import * as fs from "node:fs";
import { RouterConfig, validateRouterConfig } from "../domain/router";
import { cliError, normalizeError } from "../domain/errors";
import { writeTextFileAtomic } from "./fs-utils";

/**
 * Reads and validates router.json.
 */
export function readRouterConfig(routerConfigPath: string): RouterConfig {
  if (!fs.existsSync(routerConfigPath)) {
    throw cliError("ROUTER_CONFIG_NOT_FOUND", "Automatic routing is not configured.", {
      file: routerConfigPath,
      suggestion: "Run `codexs route configure <provider> <fallback-provider>`.",
    });
  }
  try {
    return validateRouterConfig(JSON.parse(fs.readFileSync(routerConfigPath, "utf8")));
  } catch (error: unknown) {
    throw cliError("ROUTER_CONFIG_INVALID", "Failed to parse router.json.", {
      file: routerConfigPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Reads router.json when present.
 */
export function readRouterConfigIfExists(routerConfigPath: string): RouterConfig | null {
  return fs.existsSync(routerConfigPath) ? readRouterConfig(routerConfigPath) : null;
}

/**
 * Persists a validated routing policy atomically.
 */
export function writeRouterConfig(routerConfigPath: string, config: RouterConfig): void {
  const validated = validateRouterConfig(config);
  writeTextFileAtomic(routerConfigPath, `${JSON.stringify(validated, null, 2)}\n`);
}
