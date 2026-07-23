import {
  COMMANDS,
  findCommandDefinitionByTokens,
  getNestedCommandTokens,
  getPublicCommandNames,
  isKnownHelpTopic,
} from "./registry";

const GROUP_TITLES = {
  read: "Read Commands",
  write: "Change Commands",
  recovery: "Diagnostics And Recovery",
} as const;

/**
 * Returns the known command names.
 */
export function getKnownCommandNames(): string[] {
  return getPublicCommandNames();
}

/**
 * Checks whether the requested topic is a known command.
 */
export function isKnownCommandNameForHelp(commandName: string): boolean {
  return isKnownHelpTopic(commandName);
}

/**
 * Builds the command help text for the top-level help page or a specific topic.
 */
export function buildHelpText(commandName?: string | null): string {
  if (!commandName) {
    return [
      "codex-switch",
      "",
      "Manage and switch local Codex provider/model-provider routing safely.",
      "Primary workflow: init -> add -> switch -> status -> doctor.",
      "Advanced adopt flows use migrate only when you already have Codex runtime state to import.",
      "Deprecated entry: setup still exists only to point callers to init or migrate.",
      "",
      "Usage:",
      "  codexs <command> [options]",
      "  codexs help <command>",
      "",
      ...renderGroupedCommands(),
      "",
       "Global options:",
       "  --json             Output the standard JSON envelope and disable all prompts.",
       "  --codex-dir <path> Target a specific Codex directory instead of ~/.codex.",
      "  --help             Show top-level or command-specific help.",
      "  --version          Print the current CLI version.",
       "",
       "Environment:",
       "  CODEXS_HOME        Override the codex-switch tool home directory.",
       "  CODEXS_CODEX_DIR   Default Codex directory when --codex-dir is not passed.",
       "  NODE_ENV=development defaults to ./dev-codex/local-sandbox when no override is set.",
      "",
      "Interactive rules:",
      "  Progressive prompts only run in a real TTY and never run under --json.",
      "  Human write commands may guide missing inputs or ask for dangerous-action confirmation.",
      "  Automation should pass explicit arguments and prefer --json for stable parsing.",
      "",
      "Dangerous commands:",
      "  remove deletes provider records.",
      "  import replaces or merges providers.json.",
      "  export may overwrite a target file.",
      "  rollback restores files from a managed backup.",
      "",
      "Examples:",
      "  codexs init",
      "  codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1",
      "  codexs switch packycode",
      "  codexs status",
      "  codexs route configure lxapi rivo",
      "  codexs route start [--rotate-token]",
      "  codexs route status",
      "  codexs route stop",
      "  codexs doctor",
      "  codexs migrate",
      "  codexs config show",
      "  codexs backups list",
      "  codexs rollback",
      "  codexs help add",
    ].join("\n");
  }

  const nestedCommands = getNestedCommandTokens(commandName);
  if (nestedCommands.length > 0) {
    return [
      `codexs ${commandName}`,
      "",
      `Available ${commandName} commands:`,
      ...nestedCommands.map((name) => `  ${name}`),
      "",
      "Use `codexs help <command>` for detailed usage.",
    ].join("\n");
  }

  const command = findCommandDefinitionByTokens(commandName.split(" "));
  if (!command) {
    return [
      `Unknown help topic: ${commandName}`,
      "",
      "Available commands:",
      ...getKnownCommandNames().map((name) => `  ${name}`),
    ].join("\n");
  }

  return [
    `codexs ${command.tokens.join(" ")}`,
    "",
    command.summary,
    "",
    "Usage:",
    ...command.usage.map((usage) => `  ${usage}`),
    "",
    "Details:",
    ...command.details.map((detail) => `  ${detail}`),
    "",
    "Examples:",
    ...command.examples.map((example) => `  ${example}`),
  ].join("\n");
}

function renderGroupedCommands(): string[] {
  const lines: string[] = [];
  for (const group of ["read", "write", "recovery"] as const) {
    lines.push(`${GROUP_TITLES[group]}:`);
    for (const command of COMMANDS.filter((candidate) => candidate.group === group)) {
      lines.push(`  ${command.tokens.join(" ").padEnd(12, " ")} ${command.summary}`);
    }
    lines.push("");
  }

  lines.pop();
  return lines;
}
