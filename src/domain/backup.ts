/**
 * Describes one managed file captured in a backup manifest.
 */
export type FileBackupEntry = {
  relativePath: string;
  restorePath: string;
  existed: boolean;
  backupFileName: string | null;
};

/**
 * Describes the files and metadata needed to restore a previous runtime state.
 */
export type BackupManifest = {
  version: 1;
  createdAt: string;
  reason: string;
  backupDir: string;
  files: FileBackupEntry[];
};
