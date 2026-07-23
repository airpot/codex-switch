import * as http from "node:http";
import { CircuitStatus } from "../domain/router";

export type RouterHealth = {
  ok: true;
  pid: number;
  uptimeMs: number;
  providers: string[];
  circuits: CircuitStatus[];
};

/**
 * Queries the protected worker health endpoint and returns null when it is unreachable or invalid.
 */
export function probeRouter(baseUrl: string, token: string, timeoutMs = 500): Promise<RouterHealth | null> {
  return new Promise((resolve) => {
    let healthUrl: URL;
    try {
      healthUrl = new URL("/healthz", baseUrl);
    } catch {
      resolve(null);
      return;
    }
    const request = http.get(healthUrl, {
      headers: { authorization: `Bearer ${token}` },
      timeout: timeoutMs,
    });
    const finish = once(resolve);
    request.once("timeout", () => {
      request.destroy();
      finish(null);
    });
    request.once("error", () => finish(null));
    request.once("response", (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish(null);
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          response.destroy();
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", () => finish(null));
      response.once("end", () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<RouterHealth>;
          if (
            value.ok !== true ||
            typeof value.pid !== "number" ||
            typeof value.uptimeMs !== "number" ||
            !Array.isArray(value.providers) ||
            !Array.isArray(value.circuits)
          ) {
            finish(null);
            return;
          }
          finish(value as RouterHealth);
        } catch {
          finish(null);
        }
      });
    });
  });
}

/**
 * Polls worker health until it becomes ready or the deadline expires.
 */
export async function waitForRouter(baseUrl: string, token: string, expectedPid: number, timeoutMs: number): Promise<RouterHealth | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await probeRouter(baseUrl, token);
    if (health?.pid === expectedPid) {
      return health;
    }
    await delay(100);
  }
  return null;
}

/**
 * Checks whether the operating system still recognizes a process id.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stops a verified worker process, escalating only if it ignores SIGTERM.
 */
export async function stopRouterProcess(pid: number, forceAfterMs = 2_000): Promise<void> {
  if (!isProcessAlive(pid)) {
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + forceAfterMs;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await delay(50);
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return;
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function once<T>(callback: (value: T) => void): (value: T) => void {
  let called = false;
  return (value: T): void => {
    if (!called) {
      called = true;
      callback(value);
    }
  };
}
