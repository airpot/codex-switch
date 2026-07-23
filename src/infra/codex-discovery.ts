import { findCodexDirCandidates as findCodexDirCandidatesFromConfigRepo } from "./config-repo";

/**
 * Finds candidate Codex home directories using the shared config-aware discovery rules.
 */
export function findCodexDirCandidates(explicitCodexDir?: string | null): string[] {
  return findCodexDirCandidatesFromConfigRepo(explicitCodexDir);
}
