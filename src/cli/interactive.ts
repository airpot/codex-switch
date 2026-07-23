/**
 * Compatibility facade that re-exports interactive command helpers.
 */
export {
  canPrompt,
  chooseCodexDir,
  chooseSetupProfiles,
  chooseSetupStrategy,
  collectEditInput,
  collectSetupProviderDetails,
  confirmExportOverwrite,
  confirmImport,
  confirmProviderRemoval,
  confirmRollback,
  exportTargetExists,
  getRollbackSummary,
  getRollbackSummaryById,
  promptForProviderSelection,
} from "../interaction/interactive";
