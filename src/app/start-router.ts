import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { cliError, normalizeError } from "../domain/errors";
import { buildModelProviderProjection } from "../domain/providers";
import { RouterState } from "../domain/router";
import { writeOpenAiApiKeyAuth } from "../storage/auth-repo";
import { loadManifestById, restoreManifest } from "../storage/backup-repo";
import { applyConfigMutation, createConfigMutationPlan, readStructuredConfig } from "../storage/config-repo";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFile } from "../storage/providers-repo";
import { readRouterConfig } from "../storage/router-config-repo";
import { readRouterSecretIfExists, readRouterStateIfExists, removeRouterRuntimeFiles, writeRouterSecret, writeRouterState } from "../storage/router-state-repo";
import { stopRouterProcess, waitForRouter } from "../runtime/router-client";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Starts the detached worker and projects Codex onto its authenticated localhost endpoint.
 */
export async function startRouter(args: {
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  configPath: string;
  authPath: string;
  providersPath: string;
  routerConfigPath: string;
  routerStatePath: string;
  routerSecretPath: string;
  routerLogPath: string;
  rotateToken?: boolean;
}): Promise<CommandResult> {
  const existingState = readRouterStateIfExists(args.routerStatePath);
  if (existingState) {
    throw cliError("ROUTER_STALE_STATE", "Router state already exists; inspect status or stop it before starting again.", {
      pid: existingState.pid,
      suggestion: "Run `codexs route status`, then `codexs route stop` or `codexs route stop --force`.",
    });
  }

  const config = readRouterConfig(args.routerConfigPath);
  const providers = readProvidersFile(args.providersPath);
  fs.chmodSync(args.providersPath, 0o600);
  for (const providerName of config.providers) {
    const provider = providers.providers[providerName];
    if (!provider) {
      throw cliError("PROVIDER_NOT_FOUND", `Route provider "${providerName}" was not found.`);
    }
    if (!provider.baseUrl || !provider.model) {
      throw cliError("MANAGED_PROFILE_FIELDS_MISSING", `Route provider "${providerName}" requires both baseUrl and model.`, {
        provider: providerName,
        missingFields: [!provider.baseUrl ? "baseUrl" : null, !provider.model ? "model" : null].filter(Boolean),
      });
    }
  }

  const document = readStructuredConfig(args.configPath);
  const primaryProvider = providers.providers[config.providers[0]];
  // Reusing the active provider id keeps existing Codex/VSCode threads visible after routing starts.
  const routerModelProvider = document.currentModelProvider ?? primaryProvider.profile;
  const token = args.rotateToken
    ? crypto.randomBytes(32).toString("base64url")
    : readRouterSecretIfExists(args.routerSecretPath) ?? crypto.randomBytes(32).toString("base64url");
  const baseUrl = `http://${config.host}:${config.port}/v1`;
  writeRouterSecret(args.routerSecretPath, token);
  ensureDir(path.dirname(args.routerLogPath));
  const logFd = fs.openSync(args.routerLogPath, "a", 0o600);
  fs.chmodSync(args.routerLogPath, 0o600);
  const workerPath = path.resolve(__dirname, "..", "runtime", "router-worker.js");
  const child = spawn(process.execPath, [
    workerPath,
    "--router-config", args.routerConfigPath,
    "--providers", args.providersPath,
    "--router-secret", args.routerSecretPath,
  ], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  fs.closeSync(logFd);
  child.unref();
  const pid = child.pid;
  if (!pid) {
    removeRouterRuntimeFiles(args.routerStatePath, args.routerSecretPath);
    throw cliError("ROUTER_START_FAILED", "Failed to obtain a process id for the router worker.");
  }

  const health = await waitForRouter(baseUrl, token, pid, 5_000);
  if (!health) {
    await stopRouterProcess(pid);
    removeRouterRuntimeFiles(args.routerStatePath, args.routerSecretPath);
    throw cliError("ROUTER_START_FAILED", "Router worker did not become healthy.", {
      logFile: args.routerLogPath,
      host: config.host,
      port: config.port,
    });
  }

  let backupId: string | null = null;
  try {
    const mutation = runMutation({
      lockPath: args.lockPath,
      backupsDir: args.backupsDir,
      latestBackupPath: args.latestBackupPath,
      operation: "route-start",
      files: [
        { absolutePath: args.authPath, relativePath: "auth.json" },
        { absolutePath: args.configPath, relativePath: "config.toml" },
      ],
      mutate: () => {
        const plan = createConfigMutationPlan(document, {
          setCurrentModel: document.currentModel ?? primaryProvider.model!,
          setCurrentModelProvider: routerModelProvider,
          upsertModelProviders: {
            [routerModelProvider]: buildModelProviderProjection(routerModelProvider, baseUrl),
          },
          deleteLegacyProfile: true,
          deleteLegacyProfilesByName: [routerModelProvider],
          scrubModelProviderEnvKeys: [routerModelProvider],
        });
        applyConfigMutation(args.configPath, document, plan);
        writeOpenAiApiKeyAuth(args.authPath, token);
        fs.chmodSync(args.authPath, 0o600);
        return {
          running: true,
          pid,
          baseUrl,
          providerOrder: config.providers,
          primaryProvider: config.providers[0],
          modelProvider: routerModelProvider,
        };
      },
    });
    const backupPath = String(mutation.data.backupPath);
    backupId = path.basename(backupPath);
    const state: RouterState = {
      version: 1,
      pid,
      host: config.host,
      port: config.port,
      baseUrl,
      modelProvider: routerModelProvider,
      primaryProvider: config.providers[0],
      startedAt: new Date().toISOString(),
      activationBackupId: backupId,
    };
    writeRouterState(args.routerStatePath, state);
    return mutation;
  } catch (error: unknown) {
    if (backupId) {
      try {
        restoreManifest(loadManifestById(args.backupsDir, backupId));
      } catch (restoreError: unknown) {
        await stopRouterProcess(pid);
        removeRouterRuntimeFiles(args.routerStatePath, args.routerSecretPath);
        throw cliError("ROLLBACK_FAILED", "Router startup failed and its activation backup could not be restored.", {
          cause: normalizeError(error).message,
          rollbackReason: normalizeError(restoreError).message,
          backupId,
        });
      }
    }
    await stopRouterProcess(pid);
    removeRouterRuntimeFiles(args.routerStatePath, args.routerSecretPath);
    throw error;
  }
}
