import * as path from "node:path";
import { BackupManifest } from "./backup";

export type BackupListItem = {
  backupId: string;
  createdAt: string;
  reason: string;
  files: string[];
  backupPath: string;
};

/**
 * Returns the explicit backup identifier derived from the backup directory name.
 */
export function getBackupId(backupDir: string): string {
  return path.basename(backupDir);
}

/**
 * Validates the minimal manifest shape needed for listing and restoring backups.
 */
export function validateBackupManifest(input: unknown): BackupManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Backup manifest must be an object.");
  }

  const manifest = input as Partial<BackupManifest>;
  if (manifest.version !== 1) {
    throw new Error("Unsupported backup manifest version.");
  }
  if (typeof manifest.createdAt !== "string" || manifest.createdAt.trim() === "") {
    throw new Error("Backup manifest is missing createdAt.");
  }
  if (typeof manifest.reason !== "string" || manifest.reason.trim() === "") {
    throw new Error("Backup manifest is missing reason.");
  }
  if (typeof manifest.backupDir !== "string" || manifest.backupDir.trim() === "") {
    throw new Error("Backup manifest is missing backupDir.");
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error("Backup manifest is missing files.");
  }

  for (const entry of manifest.files) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Backup manifest contains an invalid file entry.");
    }

    if (
      typeof entry.relativePath !== "string" ||
      typeof entry.restorePath !== "string" ||
      entry.restorePath.trim() === "" ||
      typeof entry.existed !== "boolean"
    ) {
      throw new Error("Backup manifest contains an invalid file entry.");
    }

    if (entry.backupFileName !== null && typeof entry.backupFileName !== "string") {
      throw new Error("Backup manifest contains an invalid backup file name.");
    }
  }

  return manifest as BackupManifest;
}

/**
 * Sorts backup list items from newest to oldest based on createdAt.
 */
export function sortBackupList(items: BackupListItem[]): BackupListItem[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Converts a manifest into the stable list payload returned by `backups list`.
 */
export function toBackupListItem(manifest: BackupManifest): BackupListItem {
  return {
    backupId: getBackupId(manifest.backupDir),
    createdAt: manifest.createdAt,
    reason: manifest.reason,
    files: manifest.files.map((file) => file.relativePath),
    backupPath: manifest.backupDir,
  };
}
