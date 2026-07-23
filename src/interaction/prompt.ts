import inquirer from "inquirer";
import { cliError } from "../domain/errors";

export type PromptChoice<TValue extends string = string> = {
  value: TValue;
  label: string;
  hint?: string;
};

/**
 * Prompt adapter used by the CLI layer so interactive flows stay testable.
 */
export type CliPromptRuntime = {
  isInteractive: () => boolean;
  inputText: (message: string, options?: { defaultValue?: string | null }) => Promise<string>;
  inputSecret: (message: string) => Promise<string>;
  selectOne: <TValue extends string>(
    message: string,
    choices: PromptChoice<TValue>[]
  ) => Promise<TValue>;
  selectMany: <TValue extends string>(
    message: string,
    choices: PromptChoice<TValue>[],
    options?: { defaultValues?: TValue[] }
  ) => Promise<TValue[]>;
  confirmAction: (message: string, options?: { defaultValue?: boolean }) => Promise<boolean>;
  writeLine: (message: string) => void;
};

/**
 * Creates the default prompt runtime backed by inquirer on the current process TTY.
 */
export function createPromptRuntime(): CliPromptRuntime {
  return {
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    inputText: async (message, options) => {
      return handlePromptCancellation(async () => {
        const answer = await inquirer.prompt([
          {
            type: "input",
            name: "value",
            message,
            default: options?.defaultValue ?? undefined,
          },
        ]);
        return String(answer.value ?? "");
      });
    },
    inputSecret: async (message) => {
      return handlePromptCancellation(async () => {
        const answer = await inquirer.prompt([
          {
            type: "password",
            name: "value",
            message,
            mask: "*",
          },
        ]);
        return String(answer.value ?? "");
      });
    },
    selectOne: async (message, choices) => {
      return handlePromptCancellation(async () => {
        const answer = await inquirer.prompt([
          {
            type: "select",
            name: "value",
            message,
            choices: choices.map((choice) => ({
              value: choice.value,
              name: choice.hint ? `${choice.label} (${choice.hint})` : choice.label,
            })),
          },
        ]);
        return answer.value as string;
      }) as Promise<never>;
    },
    selectMany: async (message, choices, options) => {
      return handlePromptCancellation(async () => {
        const answer = await inquirer.prompt([
          {
            type: "checkbox",
            name: "value",
            message,
            choices: choices.map((choice) => ({
              value: choice.value,
              name: choice.hint ? `${choice.label} (${choice.hint})` : choice.label,
              checked: Boolean(options?.defaultValues?.includes(choice.value)),
            })),
          },
        ]);
        return (Array.isArray(answer.value) ? answer.value : []) as string[];
      }) as Promise<never>;
    },
    confirmAction: async (message, options) => {
      return handlePromptCancellation(async () => {
        const answer = await inquirer.prompt([
          {
            type: "confirm",
            name: "value",
            message,
            default: options?.defaultValue ?? false,
          },
        ]);
        return Boolean(answer.value);
      });
    },
    writeLine: (message: string) => {
      process.stdout.write(`${message}\n`);
    },
  };
}

async function handlePromptCancellation<TValue>(run: () => Promise<TValue>): Promise<TValue> {
  try {
    return await run();
  } catch (error: unknown) {
    if (isPromptCancellation(error)) {
      throw cliError("PROMPT_CANCELLED", "Interactive prompt was cancelled.");
    }

    throw cliError("INVALID_ARGUMENT", "Interactive prompt failed.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function isPromptCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "ExitPromptError" || error.message.includes("force closed");
}
