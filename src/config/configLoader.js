// @ts-check

/**
 * @file Configuration loader for the Discord TTS bot (Requirement 8).
 *
 * Loads the five configuration values from the process environment, applies the
 * documented defaults for every value except the Discord token, and enforces
 * that the token is present.
 */

/**
 * Documented default configuration values. These are applied whenever the
 * corresponding environment variable is absent (Req 8.4, 8.5).
 *
 * @type {{ voicevoxUrl: string, defaultSpeaker: number, commandPrefix: string, readingLimit: number }}
 */
export const CONFIG_DEFAULTS = Object.freeze({
  voicevoxUrl: 'http://127.0.0.1:50021',
  defaultSpeaker: 3,
  commandPrefix: '!',
  readingLimit: 100,
});

/**
 * Error thrown when the required Discord bot token is absent from the
 * environment. The startup sequence catches this to log an identifying error
 * and exit with a non-zero status code (Req 8.3).
 */
export class MissingTokenError extends Error {
  /** @param {string} [message] */
  constructor(message = 'DISCORD_TOKEN is not set. Add it to your .env file.') {
    super(message);
    this.name = 'MissingTokenError';
  }
}

/**
 * @typedef {Object} Config
 * @property {string} discordToken   Required; absence throws {@link MissingTokenError}.
 * @property {string} voicevoxUrl    VOICEVOX Engine endpoint URL.
 * @property {number} defaultSpeaker Default VOICEVOX Speaker_ID.
 * @property {string} commandPrefix  Command prefix.
 * @property {number} readingLimit   Maximum spoken characters per message.
 */

/**
 * Coerce a value to a finite integer, falling back to a default when the value
 * is absent or cannot be parsed as a finite number.
 *
 * @param {string | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function toIntOrDefault(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
}

/**
 * Treat empty / whitespace-only strings as "absent" so the documented defaults
 * apply, matching the intent of Req 8.4 / 8.5.
 *
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * Load and validate configuration from the given environment (Req 8.1, 8.2).
 *
 * - Missing `DISCORD_TOKEN` throws {@link MissingTokenError} (feeds Req 8.3).
 * - Missing `VOICEVOX_URL` applies the documented default (Req 8.4).
 * - Any other missing value applies its documented default (Req 8.5).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Config}
 */
export function loadConfig(env) {
  const source = env ?? {};

  const discordToken = source.DISCORD_TOKEN;
  if (!isPresent(discordToken)) {
    throw new MissingTokenError();
  }

  return {
    discordToken: String(discordToken),
    voicevoxUrl: isPresent(source.VOICEVOX_URL)
      ? String(source.VOICEVOX_URL)
      : CONFIG_DEFAULTS.voicevoxUrl,
    defaultSpeaker: toIntOrDefault(source.DEFAULT_SPEAKER, CONFIG_DEFAULTS.defaultSpeaker),
    commandPrefix: isPresent(source.COMMAND_PREFIX)
      ? String(source.COMMAND_PREFIX)
      : CONFIG_DEFAULTS.commandPrefix,
    readingLimit: toIntOrDefault(source.READING_LIMIT, CONFIG_DEFAULTS.readingLimit),
  };
}
