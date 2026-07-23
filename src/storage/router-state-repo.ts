import * as fs from "node:fs";
import * as path from "node:path";
import { RouterState, validateRouterState } from "../domain/router";
import { cliError, normalizeError } from "../domain/errors";
import { ensureDir, writeTextFileAtomic } from "./fs-utils";

/**
 * Reads active router state when it exists.
 */
export function readRouterStateIfExists(routerStatePath: string): RouterState | null {
  if (!fs.existsSync(routerStatePath)) {
    return null;
  }
  try {
    return validateRouterState(JSON.parse(fs.readFileSync(routerStatePath, "utf8")));
  } catch (error: unknown) {
    throw cliError("ROUTER_STATE_INVALID", "Failed to parse router-state.json.", {
      file: routerStatePath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Writes runtime metadata with owner-only permissions.
 */
export function writeRouterState(routerStatePath: string, state: RouterState): void {
  writeTextFileAtomic(routerStatePath, `${JSON.stringify(validateRouterState(state), null, 2)}\n`);
  fs.chmodSync(routerStatePath, 0o600);
}

/**
 * Writes the local proxy bearer token without exposing upstream credentials.
 */
export function writeRouterSecret(routerSecretPath: string, token: string): void {
  ensureDir(path.dirname(routerSecretPath));
  fs.writeFileSync(routerSecretPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(routerSecretPath, 0o600);
}

/**
 * Reads the local proxy bearer token.
 */
export function readRouterSecret(routerSecretPath: string): string {
  if (!fs.existsSync(routerSecretPath)) {
    throw cliError("ROUTER_STATE_INVALID", "Router token file is missing.", { file: routerSecretPath });
  }
  const token = fs.readFileSync(routerSecretPath, "utf8").trim();
  if (!token) {
    throw cliError("ROUTER_STATE_INVALID", "Router token file is empty.", { file: routerSecretPath });
  }
  return token;
}

/**
 * Reads the persistent local proxy token when one has already been established.
 */
export function readRouterSecretIfExists(routerSecretPath: string): string | null {
  if (!fs.existsSync(routerSecretPath)) {
    return null;
  }
  return readRouterSecret(routerSecretPath);
}

/**
 * Removes only the active router state while preserving the local proxy token for reuse.
 */
export function removeRouterState(routerStatePath: string): void {
  fs.rmSync(routerStatePath, { force: true });
}

/**
 * Removes router state and token after a failed startup.
 */
export function removeRouterRuntimeFiles(routerStatePath: string, routerSecretPath: string): void {
  removeRouterState(routerStatePath);
  fs.rmSync(routerSecretPath, { force: true });
}
