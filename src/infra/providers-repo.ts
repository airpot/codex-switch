/**
 * Compatibility facade that re-exports provider repository helpers from storage.
 */
export {
  mergeProviders,
  readProviderRecord,
  readProvidersFile,
  readProvidersFileIfExists,
  writeProvidersFile,
} from "../storage/providers-repo";
