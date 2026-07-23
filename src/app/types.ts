/**
 * Standard command payload returned by application services.
 */
export type CommandResult = {
  data: Record<string, unknown> | null;
  warnings?: string[];
};
