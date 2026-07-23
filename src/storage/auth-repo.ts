import * as fs from "node:fs";
import { cliError, normalizeError } from "../domain/errors";

export type AuthFileState = {
  exists: boolean;
  valid: boolean;
  parseError: string | null;
  authMode: string | null;
};

/**
 * Reads auth.json when it exists and returns null otherwise.
 */
export function readAuthFileIfExists(authPath: string): unknown | null {
  if (!fs.existsSync(authPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch (error: unknown) {
    throw cliError("AUTH_JSON_INVALID", "Failed to parse auth.json.", {
      file: authPath,
      cause: normalizeError(error).message,
    });
  }
}

/**
 * Reads auth.json into a neutral file-state summary for status and doctor.
 */
export function readAuthFileState(authPath: string): AuthFileState {
  if (!fs.existsSync(authPath)) {
    return {
      exists: false,
      valid: false,
      parseError: null,
      authMode: null,
    };
  }

  try {
    const payload = readAuthFileIfExists(authPath);
    const authMode =
      payload && typeof payload === "object" && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).auth_mode === "string"
        ? String((payload as Record<string, unknown>).auth_mode)
        : null;
    return {
      exists: true,
      valid: Boolean(payload && typeof payload === "object" && !Array.isArray(payload)),
      parseError: null,
      authMode,
    };
  } catch (error: unknown) {
    return {
      exists: true,
      valid: false,
      parseError: normalizeError(error).message,
      authMode: null,
    };
  }
}

/**
 * Writes the active direct-provider auth projection expected by Codex.
 * Invalid or missing existing auth.json content is replaced with a minimal valid object.
 */
export function writeOpenAiApiKeyAuth(authPath: string, apiKey: string): void {
  let next: Record<string, unknown> = {};
  if (fs.existsSync(authPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(authPath, "utf8"));
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        next = { ...(payload as Record<string, unknown>) };
      }
    } catch {
      next = {};
    }
  }

  next.auth_mode = "apikey";
  next.OPENAI_API_KEY = apiKey;
  fs.writeFileSync(authPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
