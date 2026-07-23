/**
 * Compatibility facade that re-exports config repository helpers from storage.
 */
export {
  applyConfigMutation,
  createConfigMutationPlan,
  ensureProfileExists,
  findCodexDirCandidates,
  listConfigProfiles,
  readConfigFile,
  readCurrentProfile,
  readStructuredConfig,
  requireManagedProfileRuntime,
  requireModelProviderRuntimeSection,
  updateTopLevelProfile,
} from "../storage/config-repo";
