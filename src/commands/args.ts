import { cliError } from "../domain/errors";
import { resolveCodexDir } from "../storage/codex-paths";
import { CommandId, ParsedCommand } from "./types";
import { resolveCommandFromArgv } from "./registry";

/**
 * Parses argv into command positionals, global flags, and command-scoped options.
 */
export function parseArgs(argv: string[]): ParsedCommand {
  let json = false;
  let codexDir: string | null = null;
  let codexDirExplicit = false;
  const remaining: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      json = true;
      continue;
    }

    if (value === "--codex-dir") {
      const next = argv[index + 1];
      if (!next) {
        throw cliError("INVALID_ARGUMENT", "--codex-dir requires a path value.");
      }
      codexDir = resolveCodexDir(next);
      codexDirExplicit = true;
      index += 1;
      continue;
    }

    remaining.push(value);
  }

  if (remaining[0] === "help") {
    return {
      command: null,
      positionals: [],
      globalOptions: {
        json,
        codexDir,
        codexDirExplicit,
      },
      commandOptions: new Map<string, string[]>(),
      helpRequested: true,
      helpTarget: remaining.slice(1).join(" ") || null,
      versionRequested: false,
    };
  }

  const versionRequested = remaining.includes("--version") || remaining.includes("-v");
  if (versionRequested) {
    return defaultParsed(null, {
      json,
      codexDir,
      versionRequested: true,
    });
  }

  const { definition, consumedTokens } = resolveCommandFromArgv(remaining);
  const command = definition?.id ?? null;
  const positionals: string[] = [];
  const commandOptions = new Map<string, string[]>();
  let helpRequested = false;
  const startIndex = consumedTokens > 0 ? consumedTokens : Math.min(remaining.length, 1);

  for (let index = startIndex; index < remaining.length; index += 1) {
    const value = remaining[index];
    if (value === "--help" || value === "-h") {
      helpRequested = true;
      continue;
    }

    if (value.startsWith("--")) {
      const optionName = value;
      const next = remaining[index + 1];
      if (!next || next.startsWith("--")) {
        commandOptions.set(optionName, ["true"]);
        continue;
      }

      const existing = commandOptions.get(optionName) ?? [];
      existing.push(next);
      commandOptions.set(optionName, existing);
      index += 1;
      continue;
    }

    positionals.push(value);
  }

  return {
    command,
    positionals,
    globalOptions: {
      json,
      codexDir,
      codexDirExplicit,
    },
    commandOptions,
    helpRequested,
    helpTarget: helpRequested && definition ? definition.tokens.join(" ") : null,
    versionRequested: false,
  };
}

/**
 * Creates a parsed result for built-in synthetic commands such as help/version.
 */
function defaultParsed(
  command: CommandId | null,
  overrides?: {
    json?: boolean;
    codexDir?: string | null;
    helpRequested?: boolean;
    helpTarget?: string | null;
    versionRequested?: boolean;
  }
): ParsedCommand {
  return {
    command,
    positionals: [],
    globalOptions: {
      json: overrides?.json ?? false,
      codexDir: overrides?.codexDir ?? null,
      codexDirExplicit: false,
    },
    commandOptions: new Map<string, string[]>(),
    helpRequested: overrides?.helpRequested ?? false,
    helpTarget: overrides?.helpTarget ?? null,
    versionRequested: overrides?.versionRequested ?? false,
  };
}

/**
 * Checks whether a boolean-style option was supplied.
 */
export function hasFlag(options: Map<string, string[]>, name: string): boolean {
  return options.has(name);
}

/**
 * Returns the last supplied value for a single-valued command option.
 */
export function getSingleOption(options: Map<string, string[]>, name: string, required = true): string | null {
  const values = options.get(name) ?? [];
  if (values.length === 0) {
    return required ? null : null;
  }

  return values[values.length - 1];
}
