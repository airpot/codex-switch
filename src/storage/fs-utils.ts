import * as fs from "node:fs";
import * as path from "node:path";
import { CliErrorShape, ErrorCode, cliError } from "../domain/errors";

/**
 * Creates a directory tree when it does not already exist.
 */
export function ensureDir(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * Writes a text file via a temporary sibling file and atomic rename.
 */
export function writeTextFileAtomic(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  // Use the current process id in the temp name to reduce collision risk.
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, contents, "utf8");
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  fs.renameSync(tempPath, filePath);
}

/**
 * Reads a required text file and throws a typed error when it is missing.
 */
export function readRequiredFile(filePath: string, code: ErrorCode, label: string): string {
  if (!fs.existsSync(filePath)) {
    throw cliError(code, `${label} does not exist.`, { file: filePath });
  }
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Formats arbitrary error detail values for human-readable output.
 */
export function formatDetail(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Renders structured error details while suppressing secret-looking API key fields.
 */
export function printErrorDetails(error: CliErrorShape): string[] {
  if (!error.details) {
    return [];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(error.details)) {
    if (typeof value === "string" && key.toLowerCase().includes("apikey")) {
      // Do not leak API keys back into the terminal if one appears in error details.
      continue;
    }
    lines.push(`  ${key}: ${formatDetail(value)}`);
  }
  return lines;
}
