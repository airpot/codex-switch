import { cliError, normalizeError } from "../domain/errors";
import { loadLatestManifest, loadManifestById, restoreManifest } from "../storage/backup-repo";
import { CommandResult } from "./types";

/**
 * Restores either the latest backup or a specific historical backup by id.
 */
export function rollbackBackup(args: { latestBackupPath: string; backupsDir: string; backupId?: string | null }): CommandResult {
  const manifest = args.backupId
    ? loadManifestById(args.backupsDir, args.backupId)
    : loadLatestManifest(args.latestBackupPath);

  try {
    restoreManifest(manifest);
    return {
      data: {
        restoredFiles: manifest.files.map((file) => file.relativePath),
        backupId: args.backupId ?? null,
        backupPath: manifest.backupDir,
      },
    };
  } catch (error: unknown) {
    throw cliError("ROLLBACK_FAILED", "Rollback failed.", {
      cause: normalizeError(error).message,
      backupPath: manifest.backupDir,
      backupId: args.backupId ?? null,
    });
  }
}
