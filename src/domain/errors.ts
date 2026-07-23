export type ErrorCode =
  | "INVALID_CONFIG"
  | "CONFIG_PARSE_ERROR"
  | "CONFIG_NOT_FOUND"
  | "PROVIDERS_NOT_FOUND"
  | "PROVIDERS_PARSE_ERROR"
  | "PROVIDER_NOT_FOUND"
  | "PROFILE_NOT_FOUND"
  | "PROFILE_IN_USE"
  | "BACKUP_FAILED"
  | "BACKUP_NOT_FOUND"
  | "CODEX_LOGIN_FAILED"
  | "CODEX_NOT_INSTALLED"
  | "CODEX_VERSION_UNSUPPORTED"
  | "CODEX_DIR_NOT_FOUND"
  | "CODEX_DIR_AMBIGUOUS"
  | "ROLLBACK_FAILED"
  | "LOCK_CONFLICT"
  | "LIVE_STATE_DRIFT"
  | "INVALID_IMPORT_FILE"
  | "INVALID_ARGUMENT"
  | "MANAGED_PROFILE_FIELDS_MISSING"
  | "MIGRATE_NO_ADOPTABLE_PROFILES"
  | "AUTH_JSON_INVALID"
  | "AUTH_JSON_SYNC_FAILED"
  | "ACTIVE_PROVIDER_UNRESOLVED"
  | "UNMANAGED_ACTIVE_PROFILE"
  | "UNKNOWN_COMMAND"
  | "PROMPT_CANCELLED"
  | "PROVIDERS_ALREADY_EXISTS"
  | "COMMAND_DEPRECATED"
  | "PROVIDER_BASE_URL_MISMATCH"
  | "CLAUDE_PROVIDERS_NOT_FOUND"
  | "CLAUDE_PROVIDERS_PARSE_ERROR"
  | "CLAUDE_PROVIDER_NOT_FOUND"
  | "CLAUDE_SETTINGS_NOT_FOUND"
  | "CLAUDE_PROVIDER_ALREADY_EXISTS"
  | "ROUTER_CONFIG_NOT_FOUND"
  | "ROUTER_CONFIG_INVALID"
  | "ROUTER_ALREADY_RUNNING"
  | "ROUTER_START_FAILED"
  | "ROUTER_STATE_INVALID"
  | "ROUTER_STALE_STATE";

/**
 * Structured error payload shared by CLI rendering and domain services.
 */
export type CliErrorShape = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Creates an Error instance enriched with a stable CLI error code and optional details.
 */
export function cliError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): Error & CliErrorShape {
  const error = new Error(message) as Error & CliErrorShape;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Normalizes unknown thrown values into the shared CLI error shape.
 */
export function normalizeError(error: unknown): CliErrorShape {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const candidate = error as Partial<CliErrorShape>;
    return {
      code: (candidate.code as ErrorCode) ?? "INVALID_ARGUMENT",
      message: candidate.message ?? "Unknown error.",
      details: candidate.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "INVALID_ARGUMENT",
      message: error.message,
    };
  }

  return {
    code: "INVALID_ARGUMENT",
    message: String(error),
  };
}
