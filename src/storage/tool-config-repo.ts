import * as fs from "node:fs";
import { cliError } from "../domain/errors";
import { CodexSwitchConfig } from "./codex-paths";
import { ensureDir, writeTextFileAtomic } from "./fs-utils";

/**
 * Reads the optional tool-level codex-switch config file when present.
 */
export function readToolConfigIfExists(toolConfigPath: string): CodexSwitchConfig | null {
  if (!fs.existsSync(toolConfigPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(toolConfigPath, "utf8")) as CodexSwitchConfig;
    return validateToolConfig(parsed, toolConfigPath);
  } catch (error: unknown) {
    throw cliError("INVALID_CONFIG", "codex-switch.json is invalid.", {
      file: toolConfigPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Ensures the tool-level config file exists with the minimum stable fields.
 */
export function ensureToolConfig(toolConfigPath: string, version: string, defaultCodexDir: string): {
  created: boolean;
  config: CodexSwitchConfig;
} {
  const current = readToolConfigIfExists(toolConfigPath);
  if (current) {
    return {
      created: false,
      config: current,
    };
  }

  const next: CodexSwitchConfig = {
    version,
  };
  if (defaultCodexDir) {
    next.defaultCodexDir = defaultCodexDir;
  }
  ensureDir(require("node:path").dirname(toolConfigPath));
  writeTextFileAtomic(toolConfigPath, `${JSON.stringify(next, null, 2)}\n`);
  return {
    created: true,
    config: next,
  };
}

/**
 * Writes the tool-level config file with a normalized shape.
 */
export function writeToolConfig(toolConfigPath: string, config: CodexSwitchConfig): void {
  const normalized = validateToolConfig(config, toolConfigPath);
  writeTextFileAtomic(toolConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
}

function validateToolConfig(config: CodexSwitchConfig, toolConfigPath: string): CodexSwitchConfig {
  if (!config || typeof config !== "object") {
    throw cliError("INVALID_CONFIG", "codex-switch.json must contain a JSON object.", {
      file: toolConfigPath,
    });
  }
  if (typeof config.version !== "string" || config.version.trim() === "") {
    throw cliError("INVALID_CONFIG", "codex-switch.json requires a non-empty version field.", {
      file: toolConfigPath,
    });
  }
  if (config.defaultCodexDir !== undefined && typeof config.defaultCodexDir !== "string") {
    throw cliError("INVALID_CONFIG", "codex-switch.json.defaultCodexDir must be a string when provided.", {
      file: toolConfigPath,
    });
  }
  return {
    version: config.version,
    defaultCodexDir: config.defaultCodexDir,
  };
}
