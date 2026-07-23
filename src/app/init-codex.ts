import * as fs from "node:fs";
import { ensureDir } from "../storage/fs-utils";
import { writeProvidersFile } from "../storage/providers-repo";
import { ensureToolConfig } from "../storage/tool-config-repo";
import { CommandResult } from "./types";

/**
 * Initializes the codex-switch tool home without requiring target Codex runtime files.
 */
export function initCodex(args: {
  toolHomeDir: string;
  toolConfigPath: string;
  providersPath: string;
  version: string;
  defaultCodexDir?: string | null;
}): CommandResult {
  const toolHomeExists = fs.existsSync(args.toolHomeDir);
  if (!toolHomeExists) {
    ensureDir(args.toolHomeDir);
  }

  const toolConfigExists = fs.existsSync(args.toolConfigPath);
  const ensuredConfig = ensureToolConfig(args.toolConfigPath, args.version, args.defaultCodexDir ?? "");
  const providersExists = fs.existsSync(args.providersPath);
  if (!providersExists) {
    writeProvidersFile(args.providersPath, { providers: {} });
  }

  return {
    data: {
      toolHomeDir: args.toolHomeDir,
      toolConfigPath: args.toolConfigPath,
      providersPath: args.providersPath,
      createdToolHomeDir: !toolHomeExists,
      createdToolConfigFile: ensuredConfig.created && !toolConfigExists,
      createdProvidersFile: !providersExists,
      toolConfigAlreadyExisted: toolConfigExists,
      providersAlreadyExisted: providersExists,
    },
  };
}
