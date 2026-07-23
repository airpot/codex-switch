import * as fs from "node:fs";
import * as path from "node:path";
import { BackupManifest, FileBackupEntry } from "../domain/backup";
import { sortBackupList, toBackupListItem, validateBackupManifest } from "../domain/backups";
import { cliError, normalizeError } from "../domain/errors";
import { ensureDir, writeTextFileAtomic } from "./fs-utils";

/**
 * Creates a point-in-time backup for the managed files involved in a mutation.
 */
export function createBackup(
  backupsDir: string,
  reason: string,
  files: Array<{ absolutePath: string; relativePath: string }>
): BackupManifest {
  try {
    const backupDir = path.join(backupsDir, `${createTimestamp()}-${reason}`);
    ensureDir(backupsDir);
    ensureDir(backupDir);

    const entries: FileBackupEntry[] = [];
    for (const file of files) {
      const exists = fs.existsSync(file.absolutePath);
      const backupFileName = exists ? file.relativePath.replace(/[\\/]/g, "__") : null;
      if (exists && backupFileName) {
        // Flatten relative paths into a single filename inside the backup directory.
        fs.copyFileSync(file.absolutePath, path.join(backupDir, backupFileName));
      }

      entries.push({
        relativePath: file.relativePath,
        restorePath: file.absolutePath,
        existed: exists,
        backupFileName,
      });
    }

    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      reason,
      backupDir,
      files: entries,
    };

    writeTextFileAtomic(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (error: unknown) {
    throw cliError("BACKUP_FAILED", "Failed to create backup.", {
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Restores all files described by a backup manifest back into their original paths.
 */
export function restoreManifest(manifest: BackupManifest): void {
  for (const entry of manifest.files) {
    const targetPath = entry.restorePath;
    if (!entry.existed) {
      if (fs.existsSync(targetPath)) {
        // Remove files that were created by the failed mutation but were absent before it.
        fs.rmSync(targetPath, { force: true });
      }
      continue;
    }

    if (!entry.backupFileName) {
      throw new Error(`Backup file for ${entry.relativePath} is missing from manifest.`);
    }

    const sourcePath = path.join(manifest.backupDir, entry.backupFileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Backup file not found: ${sourcePath}`);
    }

    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

/**
 * Persists the latest successful backup manifest for manual rollback.
 */
export function saveLatestManifest(latestBackupPath: string, manifest: BackupManifest): void {
  writeTextFileAtomic(latestBackupPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Loads and validates the latest rollback manifest file.
 */
export function loadLatestManifest(latestBackupPath: string): BackupManifest {
  if (!fs.existsSync(latestBackupPath)) {
    throw cliError("BACKUP_NOT_FOUND", "No rollback backup is available.", {
      file: latestBackupPath,
    });
  }

  try {
    return validateBackupManifest(JSON.parse(fs.readFileSync(latestBackupPath, "utf8")));
  } catch (error: unknown) {
    throw cliError("ROLLBACK_FAILED", "Failed to read latest backup manifest.", {
      file: latestBackupPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Loads a backup manifest by its explicit backup id.
 */
export function loadManifestById(backupsDir: string, backupId: string): BackupManifest {
  const manifestPath = path.join(backupsDir, backupId, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw cliError("BACKUP_NOT_FOUND", `Backup "${backupId}" was not found.`, {
      backupId,
      file: manifestPath,
    });
  }

  try {
    return validateBackupManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  } catch (error: unknown) {
    throw cliError("ROLLBACK_FAILED", `Failed to read backup manifest "${backupId}".`, {
      backupId,
      file: manifestPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Lists valid backup manifests under backups/, newest first, while skipping corrupt entries with warnings.
 */
export function listBackups(backupsDir: string): {
  backups: Array<ReturnType<typeof toBackupListItem>>;
  warnings: string[];
} {
  if (!fs.existsSync(backupsDir)) {
    throw cliError("BACKUP_NOT_FOUND", "No backups directory exists.", {
      directory: backupsDir,
    });
  }

  const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
  const backups: Array<ReturnType<typeof toBackupListItem>> = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "latest.json") {
      continue;
    }

    const manifestPath = path.join(backupsDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      warnings.push(`Skipped backup "${entry.name}" because manifest.json is missing.`);
      continue;
    }

    try {
      backups.push(toBackupListItem(validateBackupManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")))));
    } catch (error: unknown) {
      warnings.push(`Skipped backup "${entry.name}" because manifest.json is invalid: ${normalizeError(error).message}`);
    }
  }

  if (backups.length === 0) {
    throw cliError("BACKUP_NOT_FOUND", "No valid backups were found.", {
      directory: backupsDir,
    });
  }

  return {
    backups: sortBackupList(backups),
    warnings,
  };
}

/**
 * Formats a filesystem-safe timestamp for backup directory names.
 */
function createTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    now.getFullYear().toString(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
