/**
 * Result of probing one external runtime dependency such as the codex CLI.
 */
export type RuntimeAvailability =
  | {
      ok: true;
      runtime: "codex";
      version?: string;
      details?: Record<string, unknown>;
    }
  | {
      ok: false;
      runtime: "codex";
      reason: "missing" | "unsupported" | "failed";
      cause: string;
      version?: string;
      details?: Record<string, unknown>;
    };
