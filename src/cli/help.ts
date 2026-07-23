/**
 * Compatibility facade that re-exports CLI help helpers from the commands layer.
 */
export { buildHelpText, getKnownCommandNames, isKnownCommandNameForHelp as isKnownCommandName } from "../commands/help";
