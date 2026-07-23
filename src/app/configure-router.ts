import { DEFAULT_ROUTER_CONFIG, RouterConfig } from "../domain/router";
import { cliError } from "../domain/errors";
import { readProvidersFile } from "../storage/providers-repo";
import { readRouterConfigIfExists, writeRouterConfig } from "../storage/router-config-repo";
import { readRouterStateIfExists } from "../storage/router-state-repo";
import { runMutation } from "./run-mutation";
import { CommandResult } from "./types";

/**
 * Saves the ordered provider queue and automatic failover policy.
 */
export function configureRouter(args: {
  lockPath: string;
  backupsDir: string;
  latestBackupPath: string;
  providersPath: string;
  routerConfigPath: string;
  routerStatePath: string;
  providerOrder: string[];
  host?: string;
  port?: number;
  failureThreshold?: number;
  cooldownMs?: number;
  firstByteTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  requestTimeoutMs?: number;
}): CommandResult {
  if (readRouterStateIfExists(args.routerStatePath)) {
    throw cliError("ROUTER_ALREADY_RUNNING", "Stop the active router before changing its configuration.");
  }
  if (args.providerOrder.length === 0) {
    throw cliError("INVALID_ARGUMENT", "route configure requires at least one provider.");
  }
  if (new Set(args.providerOrder).size !== args.providerOrder.length) {
    throw cliError("INVALID_ARGUMENT", "route configure does not allow duplicate providers.");
  }
  const providers = readProvidersFile(args.providersPath);
  const missingProviders = args.providerOrder.filter((provider) => !providers.providers[provider]);
  if (missingProviders.length > 0) {
    throw cliError("PROVIDER_NOT_FOUND", "One or more route providers were not found.", {
      missingProviders,
      availableProviders: Object.keys(providers.providers).sort(),
    });
  }
  const current = readRouterConfigIfExists(args.routerConfigPath);
  const config: RouterConfig = {
    version: 1,
    providers: args.providerOrder,
    host: resolveHost(args.host ?? current?.host ?? DEFAULT_ROUTER_CONFIG.host),
    port: args.port ?? current?.port ?? DEFAULT_ROUTER_CONFIG.port,
    failureThreshold: args.failureThreshold ?? current?.failureThreshold ?? DEFAULT_ROUTER_CONFIG.failureThreshold,
    cooldownMs: args.cooldownMs ?? current?.cooldownMs ?? DEFAULT_ROUTER_CONFIG.cooldownMs,
    firstByteTimeoutMs: args.firstByteTimeoutMs ?? current?.firstByteTimeoutMs ?? DEFAULT_ROUTER_CONFIG.firstByteTimeoutMs,
    streamIdleTimeoutMs: args.streamIdleTimeoutMs ?? current?.streamIdleTimeoutMs ?? DEFAULT_ROUTER_CONFIG.streamIdleTimeoutMs,
    requestTimeoutMs: args.requestTimeoutMs ?? current?.requestTimeoutMs ?? DEFAULT_ROUTER_CONFIG.requestTimeoutMs,
  };

  return runMutation({
    lockPath: args.lockPath,
    backupsDir: args.backupsDir,
    latestBackupPath: args.latestBackupPath,
    operation: "route-configure",
    files: [{ absolutePath: args.routerConfigPath, relativePath: "router.json" }],
    mutate: () => {
      writeRouterConfig(args.routerConfigPath, config);
      return {
        configured: true,
        providerOrder: config.providers,
        host: config.host,
        port: config.port,
        failureThreshold: config.failureThreshold,
        cooldownSeconds: config.cooldownMs / 1_000,
        firstByteTimeoutSeconds: config.firstByteTimeoutMs / 1_000,
        streamIdleTimeoutSeconds: config.streamIdleTimeoutMs / 1_000,
        requestTimeoutSeconds: config.requestTimeoutMs / 1_000,
      };
    },
  });
}

function resolveHost(host: string): "127.0.0.1" {
  if (host !== "127.0.0.1") {
    throw cliError("INVALID_ARGUMENT", "Automatic routing can only bind to 127.0.0.1.", { host });
  }
  return host;
}
