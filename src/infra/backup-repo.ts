/**
 * Compatibility facade that re-exports backup repository helpers from storage.
 */
export {
  createBackup,
  listBackups,
  loadLatestManifest,
  loadManifestById,
  restoreManifest,
  saveLatestManifest,
} from "../storage/backup-repo";
