import * as fs from "node:fs";
import { cliError } from "../domain/errors";
import { ensureDir } from "./fs-utils";

/**
 * Metadata written into the lock file for diagnostics.
 */
type LockRecord = {
  pid: number;
  operation: string;
  createdAt: string;
};

/**
 * Executes a mutation while holding an exclusive codex-switch lock file.
 */
export function withCodexLock<T>(lockPath: string, operation: string, run: () => T): T {
  ensureDir(require("node:path").dirname(lockPath));
  acquireLock(lockPath, operation);
  try {
    return run();
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Acquires the lock file using exclusive create semantics.
 */
function acquireLock(lockPath: string, operation: string): void {
  const payload: LockRecord = {
    pid: process.pid,
    operation,
    createdAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch {
    const existing = readLockRecord(lockPath);
    throw cliError("LOCK_CONFLICT", "Another codex-switch write operation is already running.", {
      file: lockPath,
      activeOperation: existing?.operation ?? "unknown",
      activePid: existing?.pid ?? null,
      activeSince: existing?.createdAt ?? null,
      requestedOperation: operation,
    });
  }
}

/**
 * Removes the lock file when the mutation completes.
 */
function releaseLock(lockPath: string): void {
  if (fs.existsSync(lockPath)) {
    fs.rmSync(lockPath, { force: true });
  }
}

/**
 * Reads the current lock metadata when a lock conflict occurs.
 */
function readLockRecord(lockPath: string): LockRecord | null {
  if (!fs.existsSync(lockPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8")) as LockRecord;
  } catch {
    return null;
  }
}
