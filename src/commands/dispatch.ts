import * as path from "node:path";
import { cliError } from "../domain/errors";
import { createPromptRuntime, CliPromptRuntime } from "../interaction/prompt";
import { resolveCodexDir, resolveCodexSwitchHome } from "../storage/codex-paths";
import { readToolConfigIfExists } from "../storage/tool-config-repo";
import { findCommandDefinition } from "./registry";
import { CommandExecutionContext, ParsedCommand } from "./types";

/**
 * Resolves the shared command definition and executes its registered handler.
 */
export async function executeCommand(
  ctx: CommandExecutionContext,
  parsed: ParsedCommand,
  runtime: CliPromptRuntime = createPromptRuntime()
) {
  const definition = findCommandDefinition(ctx.command);
  if (!definition) {
    throw cliError("UNKNOWN_COMMAND", `Unknown command: ${ctx.command}`);
  }

  const toolHomeDir = resolveCodexSwitchHome();
  const toolConfigPath = path.join(toolHomeDir, "codex-switch.json");
  const toolConfig = readToolConfigIfExists(toolConfigPath);
  ctx.options.codexDir = resolveCodexDir(ctx.options.codexDir ?? undefined, toolConfig);

  return definition.handler(ctx, parsed, runtime);
}
