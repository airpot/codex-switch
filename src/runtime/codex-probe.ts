import { checkCodexAvailable, checkCodexVersion, readCodexVersion } from "./codex-cli";
import { RuntimeAvailability } from "./types";

/**
 * Checks whether the codex CLI is installed and, optionally, satisfies a minimum version.
 */
export function probeCodexRuntime(minVersion?: string): RuntimeAvailability {
  const availability = checkCodexAvailable();
  if (!availability.ok) {
    return {
      ok: false,
      runtime: "codex",
      reason: "missing",
      cause: availability.cause ?? "Unknown codex availability failure",
    };
  }

  const versionInfo = readCodexVersion();
  if (!versionInfo.ok) {
    return {
      ok: false,
      runtime: "codex",
      reason: "failed",
      cause: versionInfo.cause,
    };
  }

  if (minVersion) {
    // Reuse the dedicated semver check so doctor and setup report the same unsupported-version behavior.
    const versionCheck = checkCodexVersion(minVersion);
    if (!versionCheck.ok) {
      return {
        ok: false,
        runtime: "codex",
        reason: "unsupported",
        cause: versionCheck.cause ?? `codex ${versionInfo.version} is below required ${minVersion}`,
        version: versionCheck.currentVersion,
      };
    }
  }

  return {
    ok: true,
    runtime: "codex",
    version: versionInfo.version,
  };
}
