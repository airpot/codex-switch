import * as fs from "node:fs";
import * as path from "node:path";
import { cliError } from "../domain/errors";
import { ensureDir } from "../storage/fs-utils";
import { readProvidersFile, writeProvidersFile } from "../storage/providers-repo";
import { CommandResult } from "./types";

/**
 * Exports the current providers registry to a user-specified file.
 */
export function exportProviders(args: {
  providersPath: string;
  targetFile: string;
  force: boolean;
}): CommandResult {
  const absoluteTarget = path.resolve(args.targetFile);
  if (fs.existsSync(absoluteTarget) && !args.force) {
    throw cliError("INVALID_IMPORT_FILE", "Export target already exists. Re-run with --force to overwrite.", {
      file: absoluteTarget,
    });
  }

  const providers = readProvidersFile(args.providersPath);
  // Create the target directory first so exports work for nested paths.
  ensureDir(path.dirname(absoluteTarget));
  writeProvidersFile(absoluteTarget, providers);

  return {
    data: {
      exportedTo: absoluteTarget,
      count: Object.keys(providers.providers).length,
    },
  };
}
