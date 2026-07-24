import { createHash } from "node:crypto";

/**
 * Recursively sorts JSON object keys while preserving array order and scalar values.
 */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }
  if (!isObject(value)) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonicalizeJsonValue(value[key]);
  }
  return output;
}

/**
 * Canonicalizes a JSON request body, leaving non-JSON and invalid JSON byte-identical.
 */
export function canonicalizeJsonBody(body: Buffer, contentType: string | undefined): Buffer {
  if (body.length === 0 || !isJsonContentType(contentType)) {
    return body;
  }
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return Buffer.from(JSON.stringify(canonicalizeJsonValue(parsed)), "utf8");
  } catch {
    return body;
  }
}

/**
 * Returns a short deterministic digest suitable for logs, never the source value.
 */
export function shortHash(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/**
 * Hashes a JSON subtree canonically so equivalent object key orders compare equally.
 */
export function shortJsonHash(value: unknown): string {
  if (value === undefined) {
    return "absent";
  }
  return shortHash(JSON.stringify(canonicalizeJsonValue(value)));
}

function isJsonContentType(contentType: string | undefined): boolean {
  return Boolean(contentType && /(?:application\/json|\+json)(?:;|$)/i.test(contentType));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
