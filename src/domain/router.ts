/**
 * Persistent automatic-routing policy. Providers are always attempted in array order.
 */
export type RouterConfig = {
  version: 1;
  providers: string[];
  host: "127.0.0.1";
  port: number;
  failureThreshold: number;
  cooldownMs: number;
  firstByteTimeoutMs: number;
  streamIdleTimeoutMs: number;
  requestTimeoutMs: number;
};

/**
 * Runtime metadata needed to inspect and safely reverse an active route projection.
 */
export type RouterState = {
  version: 1;
  pid: number;
  host: "127.0.0.1";
  port: number;
  baseUrl: string;
  modelProvider: string;
  primaryProvider: string;
  startedAt: string;
  activationBackupId: string;
};

export type CircuitStatus = {
  provider: string;
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  retryAt: string | null;
};

const NON_RETRYABLE_STATUS_CODES = new Set([400, 405, 406, 413, 414, 415, 422, 501]);

export const DEFAULT_ROUTER_CONFIG: Omit<RouterConfig, "providers"> = {
  version: 1,
  host: "127.0.0.1",
  port: 15721,
  failureThreshold: 3,
  cooldownMs: 60_000,
  firstByteTimeoutMs: 60_000,
  streamIdleTimeoutMs: 120_000,
  requestTimeoutMs: 600_000,
};

/**
 * Validates router.json and returns a normalized routing policy.
 */
export function validateRouterConfig(input: unknown): RouterConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Router config must be an object.");
  }
  const value = input as Record<string, unknown>;
  if (value.version !== 1) {
    throw new Error("Router config version must be 1.");
  }
  if (!Array.isArray(value.providers) || value.providers.length === 0 || value.providers.some((provider) => typeof provider !== "string" || provider.trim() === "")) {
    throw new Error("Router config requires at least one provider.");
  }
  const providers = (value.providers as string[]).map((provider) => provider.trim());
  if (new Set(providers).size !== providers.length) {
    throw new Error("Router provider priority cannot contain duplicates.");
  }
  if (value.host !== "127.0.0.1") {
    throw new Error("Router host must be 127.0.0.1.");
  }

  return {
    version: 1,
    providers,
    host: "127.0.0.1",
    port: requireInteger(value.port, "port", 1, 65_535),
    failureThreshold: requireInteger(value.failureThreshold, "failureThreshold", 1, 100),
    cooldownMs: requireInteger(value.cooldownMs, "cooldownMs", 1, 86_400_000),
    firstByteTimeoutMs: requireInteger(value.firstByteTimeoutMs, "firstByteTimeoutMs", 1, 86_400_000),
    // Existing v1 route files predate the idle-timeout field; normalize them to the CC Switch-aligned default.
    streamIdleTimeoutMs: requireInteger(
      value.streamIdleTimeoutMs ?? DEFAULT_ROUTER_CONFIG.streamIdleTimeoutMs,
      "streamIdleTimeoutMs",
      1,
      86_400_000
    ),
    requestTimeoutMs: requireInteger(value.requestTimeoutMs, "requestTimeoutMs", 1, 86_400_000),
  };
}

/**
 * Validates router-state.json without accepting embedded credentials.
 */
export function validateRouterState(input: unknown): RouterState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Router state must be an object.");
  }
  const value = input as Record<string, unknown>;
  if (
    value.version !== 1 ||
    value.host !== "127.0.0.1" ||
    typeof value.modelProvider !== "string" ||
    value.modelProvider.trim() === "" ||
    typeof value.baseUrl !== "string" ||
    typeof value.primaryProvider !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.activationBackupId !== "string"
  ) {
    throw new Error("Router state has invalid or missing fields.");
  }
  return {
    version: 1,
    pid: requireInteger(value.pid, "pid", 1, Number.MAX_SAFE_INTEGER),
    host: "127.0.0.1",
    port: requireInteger(value.port, "port", 1, 65_535),
    baseUrl: value.baseUrl,
    modelProvider: value.modelProvider,
    primaryProvider: value.primaryProvider,
    startedAt: value.startedAt,
    activationBackupId: value.activationBackupId,
  };
}

/**
 * Returns whether an HTTP status represents a provider-specific transient failure.
 */
export function isRetryableStatus(statusCode: number): boolean {
  if (statusCode >= 200 && statusCode < 300) {
    return false;
  }
  return !NON_RETRYABLE_STATUS_CODES.has(statusCode);
}

function requireInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Router ${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}
