import * as fs from "node:fs";
import { createRouterServer } from "./router-server";
import { readRouterConfig } from "../storage/router-config-repo";
import { readRouterSecret } from "../storage/router-state-repo";
import { readProvidersFile } from "../storage/providers-repo";

type WorkerArgs = {
  routerConfigPath: string;
  providersPath: string;
  routerSecretPath: string;
};

/**
 * Starts the detached routing worker from explicit local-state paths.
 */
export function runRouterWorker(argv: string[]): void {
  const paths = parseWorkerArgs(argv);
  const config = readRouterConfig(paths.routerConfigPath);
  const providers = readProvidersFile(paths.providersPath);
  const token = readRouterSecret(paths.routerSecretPath);
  const { server } = createRouterServer({
    config,
    providers,
    token,
    logger: (message) => process.stdout.write(`${new Date().toISOString()} ${message}\n`),
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.once("error", (error) => {
    process.stderr.write(`${new Date().toISOString()} router_error=${error.message}\n`);
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    process.stdout.write(`${new Date().toISOString()} router_listening=${config.host}:${config.port}\n`);
  });
}

function parseWorkerArgs(argv: string[]): WorkerArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error("Invalid router worker arguments.");
    }
    values.set(name, value);
  }
  const routerConfigPath = values.get("--router-config");
  const providersPath = values.get("--providers");
  const routerSecretPath = values.get("--router-secret");
  if (!routerConfigPath || !providersPath || !routerSecretPath) {
    throw new Error("Router worker requires config, providers, and secret paths.");
  }
  for (const filePath of [routerConfigPath, providersPath, routerSecretPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Router worker input does not exist: ${filePath}`);
    }
  }
  return { routerConfigPath, providersPath, routerSecretPath };
}

if (require.main === module) {
  runRouterWorker(process.argv.slice(2));
}
