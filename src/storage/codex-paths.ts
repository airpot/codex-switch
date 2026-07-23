import * as os from "node:os";
import * as path from "node:path";

export const CODEX_DIR_ENV_NAME = "CODEXS_CODEX_DIR";
export const TOOL_HOME_ENV_NAME = "CODEXS_HOME";
const DEVELOPMENT_DEFAULT_CODEX_DIR = path.resolve(process.cwd(), "dev-codex", "local-sandbox");

/**
 * Absolute paths used by codex-switch across its tool home and the target Codex directory.
 */
export type CodexPaths = {
  toolHomeDir: string;
  toolConfigPath: string;
  providersPath: string;
  routerConfigPath: string;
  routerStatePath: string;
  routerSecretPath: string;
  routerLogPath: string;
  backupsDir: string;
  latestBackupPath: string;
  lockPath: string;
  codexDir: string;
  configPath: string;
  authPath: string;
};

/**
 * Stored tool-level configuration for codex-switch.
 */
export type CodexSwitchConfig = {
  version: string;
  defaultCodexDir?: string;
};

/**
 * Resolves the tool home directory, defaulting to `~/.config/codex-switch`.
 */
export function resolveCodexSwitchHome(toolHomeDir?: string): string {
  if (toolHomeDir) {
    return path.resolve(toolHomeDir);
  }

  const envToolHome = process.env[TOOL_HOME_ENV_NAME];
  if (envToolHome) {
    return path.resolve(envToolHome);
  }

  return path.join(os.homedir(), ".config", "codex-switch");
}

/**
 * Resolves the working Codex directory using the documented precedence order.
 */
export function resolveCodexDir(codexDir?: string, toolConfig?: CodexSwitchConfig | null): string {
  if (codexDir) {
    return path.resolve(codexDir);
  }

  const envCodexDir = process.env[CODEX_DIR_ENV_NAME];
  if (envCodexDir) {
    return path.resolve(envCodexDir);
  }

  if (toolConfig?.defaultCodexDir) {
    return path.resolve(toolConfig.defaultCodexDir);
  }

  if (process.env.NODE_ENV === "development") {
    return DEVELOPMENT_DEFAULT_CODEX_DIR;
  }

  return path.join(os.homedir(), ".codex");
}

/**
 * Expands the tool home and Codex runtime into the file paths used by the CLI.
 */
export function createCodexPaths(args: { codexDir: string; toolHomeDir?: string } | string): CodexPaths {
  const input = typeof args === "string" ? { codexDir: args } : args;
  const toolHomeDir = resolveCodexSwitchHome(input.toolHomeDir);
  const codexDir = path.resolve(input.codexDir);
  return {
    toolHomeDir,
    toolConfigPath: path.join(toolHomeDir, "codex-switch.json"),
    providersPath: path.join(toolHomeDir, "providers.json"),
    routerConfigPath: path.join(toolHomeDir, "router.json"),
    routerStatePath: path.join(toolHomeDir, "router-state.json"),
    routerSecretPath: path.join(toolHomeDir, "router-token"),
    routerLogPath: path.join(toolHomeDir, "router.log"),
    backupsDir: path.join(toolHomeDir, "backups"),
    latestBackupPath: path.join(toolHomeDir, "backups", "latest.json"),
    lockPath: path.join(toolHomeDir, ".codex-switch.lock"),
    codexDir,
    configPath: path.join(codexDir, "config.toml"),
    authPath: path.join(codexDir, "auth.json"),
  };
}
