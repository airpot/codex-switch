import { handleRegisteredCommand } from "./handlers";
import { CommandDefinition, CommandId } from "./types";

/**
 * Canonical command registry used by parsing, help rendering, and dispatch.
 */
export const COMMANDS: CommandDefinition[] = [
  {
    id: "config-show",
    tokens: ["config", "show"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show the current route summary and legacy profile view.",
    usage: ["codexs config show [profile] [--json] [--codex-dir <path>]"],
    details: [
      "Returns current top-level model/model_provider together with recognizable legacy profile sections.",
      "Passing [profile] narrows the legacy profile view to one section while preserving the same shape.",
    ],
    examples: ["codexs config show", "codexs config show packycode --json"],
  },
  {
    id: "config-list-profiles",
    tokens: ["config", "list-profiles"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "List recognizable legacy config profiles with managed-state hints.",
    usage: ["codexs config list-profiles [--json] [--codex-dir <path>]"],
    details: [
      "Lists managed, unmanaged, and orphaned legacy profile sections in one stable view.",
      "Use config show for the current route summary and richer single-profile details.",
    ],
    examples: ["codexs config list-profiles", "codexs config list-profiles --json"],
  },
  {
    id: "init",
    tokens: ["init"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Initialize the codex-switch tool home for the primary workflow.",
    usage: ["codexs init [--json] [--codex-dir <path>]"],
    details: [
      "Creates codex-switch.json and providers.json under the tool home when they do not exist yet.",
      "Does not create or validate config.toml, auth.json, or the target Codex directory.",
      "When --codex-dir is passed explicitly and codex-switch.json does not exist yet, init persists it as defaultCodexDir.",
      "Otherwise init stays scoped to tool-home state and does not persist fallback Codex directory resolution.",
      "Use init first for fresh provider-management setups.",
    ],
    examples: ["codexs init", "codexs init --json --codex-dir ~/.codex"],
  },
  {
    id: "migrate",
    tokens: ["migrate"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Adopt existing Codex runtime profiles into managed providers.json state.",
    usage: ["codexs migrate [--json] [--codex-dir <path>] [--merge|--overwrite]"],
    details: [
      "Reads legacy config.toml profiles, collects complete provider records, then writes providers.json under managed backup flow.",
      "TTY mode can collect missing provider details and choose merge or overwrite when providers.json already exists.",
      "Migrate adopts only runtime profiles that already expose model, model_provider, and matching base_url.",
      "Non-TTY and --json runs still fail fast because migrate profile selection and provider details remain interactive in this release.",
      "Treat migrate as an advanced adopt helper for existing runtime state, not the default first step for fresh installs.",
    ],
    examples: ["codexs migrate", "codexs migrate --overwrite --json --codex-dir ~/.codex"],
  },
  {
    id: "setup",
    tokens: ["setup"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Deprecated. Kept only to point callers to init or migrate.",
    usage: ["codexs setup"],
    details: [
      "setup no longer performs initialization or migration work.",
      "Use init for the primary fresh-install workflow.",
      "Use migrate only when adopting from existing legacy config.toml profiles.",
    ],
    examples: ["codexs help init", "codexs help migrate"],
  },
  {
    id: "list",
    tokens: ["list"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "List managed providers with model-provider routing and current-state hints.",
    usage: ["codexs list [--claude] [--json] [--codex-dir <path>]"],
    details: [
      "Reads providers.json and prints provider-to-model-provider mappings.",
      "When the active model_provider is shared by multiple providers, list surfaces the ambiguity instead of inventing one current provider.",
      "Use --claude to list Claude Code provider profiles instead of Codex providers.",
      "Use --json for machine-readable automation output.",
    ],
    examples: ["codexs list", "codexs list --claude", "codexs list --json"],
  },
  {
    id: "show",
    tokens: ["show"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show one provider record from providers.json.",
    usage: ["codexs show <provider> [--claude] [--json] [--codex-dir <path>]"],
    details: [
      "Human-readable output masks apiKey by default.",
      "TTY mode can select a missing provider interactively before showing its record.",
      "JSON mode returns the full provider payload for local automation.",
      "Use --claude to show a Claude Code provider profile.",
    ],
    examples: ["codexs show packycode", "codexs show --claude copilot", "codexs show packycode --json"],
  },
  {
    id: "current",
    tokens: ["current"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show the active top-level model/model_provider route from config.toml.",
    usage: ["codexs current [--claude] [--json] [--codex-dir <path>]"],
    details: ["Reads the currently active top-level model and model_provider.", "Use --claude to detect the active Claude Code profile.", "Fails when config.toml is missing or has no top-level model_provider."],
    examples: ["codexs current", "codexs current --claude", "codexs current --json"],
  },
  {
    id: "status",
    tokens: ["status"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show target Codex directory, managed route, and health status.",
    usage: ["codexs status [--json] [--codex-dir <path>]"],
    details: [
      "Reports the target Codex directory, tool-home root, current model, current model_provider, and whether the live route is mapped.",
      "Surfaces dual-path config consistency signals without mutating any files.",
      "Organizes the human-readable view around current state, health impact, and next step.",
      "Use doctor for deeper diagnostics.",
    ],
    examples: ["codexs status", "codexs status --json --codex-dir ./.tmp-codex"],
  },
  {
    id: "route-status",
    tokens: ["route", "status"],
    handler: handleRegisteredCommand,
    group: "read",
    summary: "Show automatic router configuration, process health, and circuit state.",
    usage: ["codexs route status [--json]"],
    details: [
      "Reports the strict provider priority order and whether the localhost worker is healthy.",
      "Circuit state is read from the authenticated worker without exposing local or upstream credentials.",
    ],
    examples: ["codexs route status", "codexs route status --json"],
  },
  {
    id: "route-configure",
    tokens: ["route", "configure"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Configure ordered automatic provider failover.",
    usage: [
      "codexs route configure <provider> [fallback-provider ...] [--host 127.0.0.1] [--port <port>] [--failure-threshold <count>] [--cooldown-seconds <seconds>] [--first-byte-timeout-seconds <seconds>] [--stream-idle-timeout-seconds <seconds>] [--request-timeout-seconds <seconds>] [--json]",
    ],
    details: [
      "Providers are attempted in the exact order supplied for every request.",
      "The router binds only to 127.0.0.1 and requires every provider to exist in providers.json.",
      "Configuration changes require the worker to be stopped.",
    ],
    examples: [
      "codexs route configure lxapi rivo",
      "codexs route configure lxapi rivo --failure-threshold 3 --cooldown-seconds 60 --json",
    ],
  },
  {
    id: "route-start",
    tokens: ["route", "start"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Start the headless localhost router and activate it in Codex.",
    usage: ["codexs route start [--rotate-token] [--json] [--codex-dir <path>]"],
    details: [
      "Starts a detached Node.js worker with a persistent owner-only local bearer token.",
      "The token is reused across normal stop/start cycles so existing Codex clients do not receive avoidable 401 responses; use --rotate-token to replace it explicitly.",
      "Health-checks the worker before backing up and projecting config.toml and auth.json.",
      "No graphical environment is required.",
    ],
    examples: ["codexs route start", "codexs route start --rotate-token --json"],
  },
  {
    id: "route-stop",
    tokens: ["route", "stop"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Restore the pre-router Codex files and stop the worker.",
    usage: ["codexs route stop [--force] [--json] [--codex-dir <path>]"],
    details: [
      "Restores the exact config.toml and auth.json snapshot captured by route start.",
      "Refuses to overwrite drifted runtime files unless --force is supplied.",
      "Only signals a process after its authenticated health response matches the recorded pid.",
    ],
    examples: ["codexs route stop", "codexs route stop --force --json"],
  },
  {
    id: "edit",
    tokens: ["edit"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Update fields on a single provider record.",
    usage: [
      "codexs edit <provider> [--profile <model-provider-id>] [--api-key <key>] [--base-url <url>] [--model <name>] [--note <text>] [--tag <tag> ...] [--json] [--codex-dir <path>]",
      "codexs edit <provider> --profile <model-provider-id> --model <name> --base-url <url>",
    ],
    details: [
      "Passed flags replace only the selected fields and keep the rest unchanged.",
      "TTY mode can first select a provider, then prompt for fields when no editable options were provided.",
      "Interactive tags use preset multi-select only.",
      "--profile is a CLI alias for the stored model_provider id.",
      "When rebinding to a new direct model_provider id, the command must be able to project base_url from --base-url, the provider record, or an existing model_providers section.",
      "Backs up providers.json and config.toml before writing.",
    ],
    examples: ["codexs edit packycode --note primary", "codexs edit packycode --tag daily --tag paid --json"],
  },
  {
    id: "add",
    tokens: ["add"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Add a managed provider.",
    usage: [
      "codexs add <provider> --profile <model-provider-id> --model <name> --api-key <key> [--base-url <url>] [--note <text>] [--tag <tag> ...]",
      "codexs add --claude <name> --from-file <settings.json> [--note <text>] [--tag <tag> ...]",
      "codexs add [--profile <model-provider-id>] [--model <name>] [--api-key <key>] [--base-url <url>] [--note <text>] [--tag <tag> ...]",
    ],
    details: [
      "Prompts only for missing required values when stdin/stdout are TTYs and --json is not set.",
      "Interactive add collects provider name, model_provider id, model, and apiKey progressively as plain text inputs.",
      "Confirm API key when prompted interactively because the hidden prompt asks twice before writing.",
      "Interactive tags use preset multi-select only.",
      "Automation and non-TTY environments must pass all required values explicitly.",
      "--profile is a CLI alias for the stored model_provider id.",
      "The command projects only model_providers sections and does not create legacy profiles sections.",
      "Use --claude to add a Claude Code provider profile from an existing settings file.",
    ],
    examples: [
      "codexs add packycode --profile packycode --model gpt-5 --api-key sk-xxx --base-url https://api.example/v1",
      "codexs add --claude copilot --from-file ~/.claude/settings-copilot.json",
      "codexs add",
    ],
  },
  {
    id: "switch",
    tokens: ["switch"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Switch the active runtime to a managed provider.",
    usage: ["codexs switch <provider> [--claude] [--json] [--codex-dir <path>]"],
    details: [
      "When <provider> is omitted in a TTY, an interactive provider selector is shown.",
      "When <provider> is passed explicitly, switch proceeds directly without extra confirmation.",
      "Updates the active config profile and rewrites auth.json with auth_mode=apikey plus OPENAI_API_KEY.",
      "Switch succeeds only after the managed profile projection is written to the target runtime.",
      "Backs up config.toml and auth.json and rolls back on failure.",
      "Use --claude to switch Claude Code's settings.json to a registered Claude provider profile.",
    ],
    examples: ["codexs switch freemodel", "codexs switch --claude copilot", "codexs switch packycode --json"],
  },
  {
    id: "remove",
    tokens: ["remove"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Remove a provider from providers.json.",
    usage: ["codexs remove <provider> [--claude] [--force] [--switch-to <provider>] [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode can select a missing provider interactively and always asks for deletion confirmation.",
      "Non-TTY and --json automation still require both <provider> and --force.",
      "The confirmation prompt includes the provider name and cancels without writing when declined.",
      "When removing the only provider linked to the active model_provider route, pass --switch-to <provider-name> first.",
      "Backs up providers.json and config.toml before removing the record.",
      "Use --claude to remove a Claude Code provider profile.",
    ],
    examples: ["codexs remove freemodel", "codexs remove --claude copilot --force", "codexs remove freemodel --force --json"],
  },
  {
    id: "import",
    tokens: ["import"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Replace providers.json with an external JSON file.",
    usage: ["codexs import <file> [--json] [--codex-dir <path>]"],
    details: [
      "The file path is always explicit; there is no path wizard in this release.",
      "TTY mode asks for confirmation before replacing or merging into the current providers registry.",
      "Non-TTY and --json runs stay non-interactive and validate the file before writing.",
    ],
    examples: ["codexs import ./providers.json", "codexs import ./providers.json --merge --json"],
  },
  {
    id: "export",
    tokens: ["export"],
    handler: handleRegisteredCommand,
    group: "write",
    summary: "Export the current providers.json to another file.",
    usage: ["codexs export <file> [--force] [--json] [--codex-dir <path>]"],
    details: [
      "The file path is always explicit; there is no path wizard in this release.",
      "TTY mode asks before overwriting an existing target when --force is not supplied.",
      "Non-TTY and --json automation require --force to overwrite an existing file.",
    ],
    examples: ["codexs export ./providers-backup.json", "codexs export ./providers-backup.json --force"],
  },
  {
    id: "backups-list",
    tokens: ["backups", "list"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "List historical backup entries.",
    usage: ["codexs backups list [--json] [--codex-dir <path>]"],
    details: [
      "Enumerates backups/ manifests and returns them newest first.",
      "Corrupt backup manifests are skipped with warnings instead of failing the whole command.",
    ],
    examples: ["codexs backups list", "codexs backups list --json"],
  },
  {
    id: "doctor",
    tokens: ["doctor"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Run issue-first diagnostics across tool-home and target-runtime state.",
    usage: ["codexs doctor [--json] [--codex-dir <path>]"],
    details: [
      "Checks the expected config files, provider/model-provider consistency, and Codex CLI availability.",
      "Returns structured issues so users and AI agents can act on them.",
    ],
    examples: ["codexs doctor", "codexs doctor --json"],
  },
  {
    id: "rollback",
    tokens: ["rollback"],
    handler: handleRegisteredCommand,
    group: "recovery",
    summary: "Restore the latest managed backup or a specific backup id.",
    usage: ["codexs rollback [<backup-id>] [--json] [--codex-dir <path>]"],
    details: [
      "TTY mode previews the target backup path and affected files, then asks for confirmation.",
      "Non-TTY and --json runs stay non-interactive and execute immediately.",
      "Use after a failed or undesired managed mutation.",
    ],
    examples: ["codexs rollback", "codexs rollback 20260511-221457-switch --json"],
  },
];

const COMMAND_NAME_SET = new Set(COMMANDS.flatMap((command) => [command.id, command.tokens.join(" ")]));
const HELP_TOPIC_SET = new Set([
  ...COMMANDS.map((command) => command.tokens.join(" ")),
  ...new Set(COMMANDS.filter((command) => command.tokens.length > 1).map((command) => command.tokens[0])),
]);

/**
 * Returns a defensive copy of the public command registry.
 */
export function getCommandDefinitions(): CommandDefinition[] {
  return COMMANDS.slice();
}

/**
 * Returns stable internal command ids in registry order.
 */
export function getKnownCommandIds(): CommandId[] {
  return COMMANDS.map((command) => command.id);
}

/**
 * Resolves one command definition by its canonical internal id.
 */
export function findCommandDefinition(commandId: CommandId | "help" | "version"): CommandDefinition | null {
  if (commandId === "help" || commandId === "version") {
    return null;
  }
  return COMMANDS.find((command) => command.id === commandId) ?? null;
}

/**
 * Resolves a command definition from its tokenized CLI spelling.
 */
export function findCommandDefinitionByTokens(tokens: string[]): CommandDefinition | null {
  return COMMANDS.find((command) => command.tokens.join(" ") === tokens.join(" ")) ?? null;
}

/**
 * Matches argv against the longest registered token sequence first.
 */
export function resolveCommandFromArgv(argv: string[]): {
  definition: CommandDefinition | null;
  consumedTokens: number;
} {
  // Nested commands such as "config show" must win over their shorter root tokens.
  for (const command of COMMANDS
    .slice()
    .sort((left, right) => right.tokens.length - left.tokens.length)) {
    const candidate = argv.slice(0, command.tokens.length);
    if (candidate.length === command.tokens.length && candidate.join(" ") === command.tokens.join(" ")) {
      return {
        definition: command,
        consumedTokens: command.tokens.length,
      };
    }
  }

  return {
    definition: null,
    consumedTokens: 0,
  };
}

/**
 * Reports whether a name is reserved by either a command id or its public token form.
 */
export function isKnownCommandName(commandName: string): boolean {
  return COMMAND_NAME_SET.has(commandName);
}

/**
 * Reports whether a help topic is recognized by the help renderer.
 */
export function isKnownHelpTopic(topic: string): boolean {
  return HELP_TOPIC_SET.has(topic);
}

/**
 * Returns public command names exactly as they appear in help and examples.
 */
export function getPublicCommandNames(): string[] {
  return COMMANDS.map((command) => command.tokens.join(" "));
}

/**
 * Returns nested command spellings for one root token such as "config" or "backups".
 */
export function getNestedCommandTokens(rootToken: string): string[] {
  return COMMANDS
    .filter((command) => command.tokens.length > 1 && command.tokens[0] === rootToken)
    .map((command) => command.tokens.join(" "));
}
