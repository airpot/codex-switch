import { spawnSync } from "node:child_process";
import { cliError } from "../domain/errors";

type SpawnLike = typeof spawnSync;

let spawnImplementation: SpawnLike = spawnSync;

function getCodexInvocation(args: string[]): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["codex", ...args].join(" ")],
    };
  }

  return {
    command: "codex",
    args,
  };
}

/**
 * Overrides the spawn implementation for tests.
 */
export function setCodexSpawnImplementation(spawnLike: SpawnLike): void {
  spawnImplementation = spawnLike;
}

/**
 * Restores the default Node spawn implementation after tests.
 */
export function resetCodexSpawnImplementation(): void {
  spawnImplementation = spawnSync;
}

/**
 * Runs `codex login --with-api-key` in the target Codex directory.
 */
export function runCodexLogin(apiKey: string, workingDir: string): void {
  const invocation = getCodexInvocation(["login", "--with-api-key"]);
  const result = spawnImplementation(invocation.command, invocation.args, {
    cwd: workingDir,
    input: `${apiKey}\n`,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    throw cliError("CODEX_LOGIN_FAILED", "codex login --with-api-key failed.", {
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown codex login failure"),
    });
  }
}

/**
 * Checks whether the Codex CLI is available on PATH.
 */
export function checkCodexAvailable(): { ok: boolean; cause?: string } {
  const invocation = getCodexInvocation(["--version"]);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown failure"),
    };
  }

  return { ok: true };
}

/**
 * Reads the installed codex CLI version string.
 */
export function readCodexVersion(): { ok: true; version: string } | { ok: false; cause: string } {
  const invocation = getCodexInvocation(["--version"]);
  const result = spawnImplementation(invocation.command, invocation.args, {
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      cause: result.error?.message ?? (result.stderr.trim() || "Unknown failure"),
    };
  }

  const raw = `${result.stdout ?? ""} ${result.stderr ?? ""}`.trim();
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    return {
      ok: false,
      cause: `Unable to parse codex version from output: ${raw || "(empty output)"}`,
    };
  }

  return { ok: true, version: match[1] };
}

/**
 * Compares the installed codex version against a minimum required version.
 */
export function checkCodexVersion(
  minVersion: string
): { ok: boolean; currentVersion?: string; cause?: string } {
  const current = readCodexVersion();
  if (!current.ok) {
    return {
      ok: false,
      cause: current.cause,
    };
  }

  if (compareVersions(current.version, minVersion) < 0) {
    return {
      ok: false,
      currentVersion: current.version,
      cause: `codex ${current.version} is below required ${minVersion}`,
    };
  }

  return {
    ok: true,
    currentVersion: current.version,
  };
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((value) => Number.parseInt(value, 10));
  const rightParts = right.split(".").map((value) => Number.parseInt(value, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}
