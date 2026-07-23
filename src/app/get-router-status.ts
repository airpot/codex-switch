import { isProcessAlive, probeRouter } from "../runtime/router-client";
import { readRouterConfigIfExists } from "../storage/router-config-repo";
import { readRouterSecret, readRouterStateIfExists } from "../storage/router-state-repo";
import { CommandResult } from "./types";

/**
 * Reports configured priority, process health, and live circuit state without exposing credentials.
 */
export async function getRouterStatus(args: {
  routerConfigPath: string;
  routerStatePath: string;
  routerSecretPath: string;
  routerLogPath: string;
}): Promise<CommandResult> {
  const config = readRouterConfigIfExists(args.routerConfigPath);
  const state = readRouterStateIfExists(args.routerStatePath);
  let health = null;
  if (state) {
    try {
      health = await probeRouter(state.baseUrl, readRouterSecret(args.routerSecretPath));
    } catch {
      health = null;
    }
  }
  const processAlive = state ? isProcessAlive(state.pid) : false;
  const running = Boolean(state && health?.pid === state.pid);
  return {
    data: {
      configured: Boolean(config),
      running,
      stale: Boolean(state && !running),
      processAlive,
      providerOrder: config?.providers ?? [],
      host: config?.host ?? null,
      port: config?.port ?? null,
      pid: state?.pid ?? null,
      startedAt: state?.startedAt ?? null,
      baseUrl: state?.baseUrl ?? (config ? `http://${config.host}:${config.port}/v1` : null),
      modelProvider: state?.modelProvider ?? null,
      circuits: health?.circuits ?? [],
      logFile: args.routerLogPath,
    },
  };
}
