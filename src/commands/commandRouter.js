// @ts-check

/**
 * @file Command parsing (Requirements 10.1, 10.3).
 *
 * `parseCommand` is a pure function that gates on the Command_Prefix and, when
 * present, extracts the command name and arguments. A prefixed message that does
 * not name exactly one recognized command yields a `null` command name so the
 * dispatcher (task 13) can respond with the unrecognized-command message.
 */

/**
 * The set of recognized command names (Req 10).
 * @type {ReadonlyArray<'join'|'leave'|'skip'|'clear'|'voice'|'voices'|'help'>}
 */
export const RECOGNIZED_COMMANDS = Object.freeze([
  'join',
  'leave',
  'skip',
  'clear',
  'voice',
  'voices',
  'help',
]);

/**
 * @typedef {'join'|'leave'|'skip'|'clear'|'voice'|'voices'|'help'} CommandName
 */

/**
 * @typedef {Object} ParsedCommand
 * @property {CommandName | null} name The recognized command, or null if unrecognized.
 * @property {string[]} args           Remaining whitespace-separated arguments.
 */

/**
 * Parse a message into a command.
 *
 * @param {string} content The raw message content.
 * @param {string} prefix  The configured Command_Prefix.
 * @returns {ParsedCommand | null} `null` when the content does not begin with the
 *   prefix (Req 10.1 / Property 12); otherwise a parsed command whose `name` is
 *   `null` when no recognized command is named (Req 10.3).
 */
export function parseCommand(content, prefix) {
  if (typeof content !== 'string' || typeof prefix !== 'string' || prefix.length === 0) {
    return null;
  }
  if (!content.startsWith(prefix)) {
    return null;
  }

  const rest = content.slice(prefix.length).trim();
  const tokens = rest.length === 0 ? [] : rest.split(/\s+/);

  if (tokens.length === 0) {
    return { name: null, args: [] };
  }

  const first = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  if (RECOGNIZED_COMMANDS.includes(/** @type {CommandName} */ (first))) {
    return { name: /** @type {CommandName} */ (first), args };
  }
  return { name: null, args };
}
