#!/usr/bin/env node
import { CommandExecutionContext } from "./commands/types";
import { parseArgs } from "./commands/args";
import { buildHelpText, getKnownCommandNames, isKnownCommandNameForHelp } from "./commands/help";
import { cliError, normalizeError } from "./domain/errors";
import { outputFailure, outputSuccess } from "./cli/output";

const VERSION = (require("../package.json") as { version?: string }).version ?? "0.0.0";

/**
 * Prints the command help text to stdout.
 */
export function printHelp(commandName?: string | null): void {
  process.stdout.write(`${buildHelpText(commandName)}\n`);
}

/**
 * Prints the current CLI version to stdout.
 */
export function printVersion(): void {
  process.stdout.write(`${VERSION}\n`);
}

/**
 * Parses arguments, dispatches the selected command, and renders the final output.
 */
export function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.versionRequested) {
    printVersion();
    process.exit(0);
  }

  if (parsed.helpRequested) {
    if (parsed.helpTarget && !isKnownCommandNameForHelp(parsed.helpTarget)) {
      outputFailure(
        { command: "help", options: parsed.globalOptions },
        normalizeError(
          cliError("INVALID_ARGUMENT", `Unknown help topic: ${parsed.helpTarget}`, {
            availableCommands: getKnownCommandNames(),
          })
        )
      );
      return;
    }

    printHelp(parsed.helpTarget);
    process.exit(0);
  }

  if (!parsed.command) {
    printHelp();
    process.exit(0);
  }

  const ctx: CommandExecutionContext = {
    command: parsed.command,
    options: parsed.globalOptions,
  };

  import("./commands/dispatch")
    .then(({ executeCommand }) => executeCommand(ctx, parsed))
    .then((result) => {
      outputSuccess(ctx, result);
    })
    .catch((error: unknown) => {
      outputFailure(ctx, normalizeError(error));
    });
}

if (require.main === module) {
  main();
}
