/**
 * Global flags that apply to every CLI command.
 */
export type GlobalOptions = {
  json: boolean;
  codexDir: string | null;
  codexDirExplicit?: boolean;
};

/**
 * Stable internal command identifiers used by help, parsing, dispatch, and JSON output.
 */
export type CommandId =
  | "config-show"
  | "config-list-profiles"
  | "init"
  | "migrate"
  | "list"
  | "show"
  | "current"
  | "status"
  | "route-configure"
  | "route-start"
  | "route-status"
  | "route-stop"
  | "setup"
  | "edit"
  | "add"
  | "switch"
  | "remove"
  | "import"
  | "export"
  | "backups-list"
  | "doctor"
  | "rollback";

/**
 * Parsed CLI input split into a stable command id, positional arguments, and options.
 */
export type ParsedCommand = {
  command: CommandId | null;
  positionals: string[];
  globalOptions: GlobalOptions;
  commandOptions: Map<string, string[]>;
  helpRequested: boolean;
  helpTarget: string | null;
  versionRequested: boolean;
};

/**
 * Execution context shared between parsing and rendering.
 */
export type CommandExecutionContext = {
  command: CommandId | "help" | "version";
  options: GlobalOptions;
};

export type CommandGroup = "read" | "write" | "recovery";

export type CommandDefinition = {
  id: CommandId;
  tokens: string[];
  group: CommandGroup;
  summary: string;
  usage: string[];
  details: string[];
  examples: string[];
  handler: CommandHandler;
};

export type CommandHandler = (
  ctx: CommandExecutionContext,
  parsed: ParsedCommand,
  runtime: import("../interaction/prompt").CliPromptRuntime
) => Promise<import("../app/types").CommandResult> | import("../app/types").CommandResult;
