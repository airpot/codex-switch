import { listBackups } from "../storage/backup-repo";
import { CommandResult } from "./types";

/**
 * Lists backup manifests available under the managed Codex backups directory.
 */
export function listBackupEntries(backupsDir: string): CommandResult {
  const result = listBackups(backupsDir);
  return {
    data: {
      backups: result.backups,
      count: result.backups.length,
    },
    warnings: result.warnings,
  };
}
