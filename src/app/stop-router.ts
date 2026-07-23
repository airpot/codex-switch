import { cliError } from "../domain/errors";
import { readAuthFileIfExists } from "../storage/auth-repo";
import { loadManifestById, restoreManifest } from "../storage/backup-repo";
import { readStructuredConfig } from "../storage/config-repo";
import { withCodexLock } from "../storage/lock-repo";
import { isProcessAlive, probeRouter, stopRouterProcess } from "../runtime/router-client";
import { readRouterSecret, readRouterStateIfExists, removeRouterState } from "../storage/router-state-repo";
import { CommandResult } from "./types";

/**
 * Restores the activation backup and then shuts down the verified worker process.
 */
export async function stopRouter(args: {
  lockPath: string;
  backupsDir: string;
  configPath: string;
  authPath: string;
  routerStatePath: string;
  routerSecretPath: string;
  force: boolean;
}): Promise<CommandResult> {
  const state = readRouterStateIfExists(args.routerStatePath);
  if (!state) {
    removeRouterState(args.routerStatePath);
    return { data: { running: false, stopped: false, restored: false } };
  }

  let token: string | null = null;
  try {
    token = readRouterSecret(args.routerSecretPath);
  } catch {
    token = null;
  }
  if (!args.force && (!token || !isExpectedProjection(args.configPath, args.authPath, state.baseUrl, state.modelProvider, token))) {
    throw cliError("LIVE_STATE_DRIFT", "Codex files no longer match the active router projection.", {
      suggestion: "Inspect config.toml and auth.json, then use `codexs route stop --force` only if restoring the route-start backup is intended.",
    });
  }

  const manifest = loadManifestById(args.backupsDir, state.activationBackupId);
  withCodexLock(args.lockPath, "route-stop", () => restoreManifest(manifest));

  let workerVerified = false;
  if (token) {
    const health = await probeRouter(state.baseUrl, token);
    workerVerified = health?.pid === state.pid;
  }
  if (workerVerified) {
    await stopRouterProcess(state.pid);
  }
  removeRouterState(args.routerStatePath);
  return {
    data: {
      running: false,
      stopped: workerVerified || !isProcessAlive(state.pid),
      restored: true,
      backupId: state.activationBackupId,
      unverifiedProcessStillAlive: !workerVerified && isProcessAlive(state.pid),
    },
  };
}

function isExpectedProjection(configPath: string, authPath: string, baseUrl: string, modelProvider: string, token: string): boolean {
  try {
    const config = readStructuredConfig(configPath);
    const section = config.modelProviders.find((candidate) => candidate.name === modelProvider);
    const auth = readAuthFileIfExists(authPath);
    return Boolean(
      config.currentModelProvider === modelProvider &&
      section?.baseUrl === baseUrl &&
      auth &&
      typeof auth === "object" &&
      !Array.isArray(auth) &&
      (auth as Record<string, unknown>).OPENAI_API_KEY === token
    );
  } catch {
    return false;
  }
}
