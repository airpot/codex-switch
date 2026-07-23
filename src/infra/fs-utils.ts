/**
 * Compatibility facade that re-exports shared filesystem helpers from storage.
 */
export {
  ensureDir,
  formatDetail,
  printErrorDetails,
  readRequiredFile,
  writeTextFileAtomic,
} from "../storage/fs-utils";
