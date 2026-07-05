// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  loadConfig,
  MissingTokenError,
  CONFIG_DEFAULTS,
} from '../src/config/configLoader.js';

const NUM_RUNS = 100;

describe('loadConfig', () => {
  // Feature: discord-tts-bot, Property 11: Configuration defaults are applied
  // For any subset of optional configuration variables that are omitted (with
  // the Discord token present), loadConfig returns the documented default value
  // for each omitted variable and the provided value for each present variable.
  // Validates: Requirements 8.4, 8.5
  it('Property 11: applies documented defaults for omitted optional vars, provided values otherwise', () => {
    fc.assert(
      fc.property(
        // For each optional key, decide whether it is present and (if so) its value.
        fc.record({
          VOICEVOX_URL: fc.option(
            fc.webUrl(),
            { nil: undefined }
          ),
          DEFAULT_SPEAKER: fc.option(
            fc.integer({ min: 0, max: 100 }),
            { nil: undefined }
          ),
          COMMAND_PREFIX: fc.option(
            // Non-empty, non-whitespace prefixes so "present" is meaningful.
            fc.string({ minLength: 1, maxLength: 3 }).filter((s) => s.trim() !== ''),
            { nil: undefined }
          ),
          READING_LIMIT: fc.option(
            fc.integer({ min: 1, max: 5000 }),
            { nil: undefined }
          ),
        }),
        (choices) => {
          /** @type {Record<string, string | undefined>} */
          const env = { DISCORD_TOKEN: 'token-123' };
          if (choices.VOICEVOX_URL !== undefined) env.VOICEVOX_URL = choices.VOICEVOX_URL;
          if (choices.DEFAULT_SPEAKER !== undefined) {
            env.DEFAULT_SPEAKER = String(choices.DEFAULT_SPEAKER);
          }
          if (choices.COMMAND_PREFIX !== undefined) env.COMMAND_PREFIX = choices.COMMAND_PREFIX;
          if (choices.READING_LIMIT !== undefined) {
            env.READING_LIMIT = String(choices.READING_LIMIT);
          }

          const config = loadConfig(env);

          // Present -> provided value; omitted -> documented default.
          expect(config.voicevoxUrl).toBe(
            choices.VOICEVOX_URL !== undefined
              ? choices.VOICEVOX_URL
              : CONFIG_DEFAULTS.voicevoxUrl
          );
          expect(config.defaultSpeaker).toBe(
            choices.DEFAULT_SPEAKER !== undefined
              ? choices.DEFAULT_SPEAKER
              : CONFIG_DEFAULTS.defaultSpeaker
          );
          expect(config.commandPrefix).toBe(
            choices.COMMAND_PREFIX !== undefined
              ? choices.COMMAND_PREFIX
              : CONFIG_DEFAULTS.commandPrefix
          );
          expect(config.readingLimit).toBe(
            choices.READING_LIMIT !== undefined
              ? choices.READING_LIMIT
              : CONFIG_DEFAULTS.readingLimit
          );
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // --- Unit tests (task 2.3) ---

  it('throws MissingTokenError when DISCORD_TOKEN is absent (Req 8.3)', () => {
    expect(() => loadConfig({})).toThrow(MissingTokenError);
  });

  it('throws MissingTokenError when DISCORD_TOKEN is empty/whitespace (Req 8.3)', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: '   ' })).toThrow(MissingTokenError);
  });

  it('applies the default VOICEVOX_URL when omitted (Req 8.4)', () => {
    const config = loadConfig({ DISCORD_TOKEN: 't' });
    expect(config.voicevoxUrl).toBe('http://127.0.0.1:50021');
  });

  it('reads all five configuration values when present (Req 8.2)', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 'my-token',
      VOICEVOX_URL: 'http://localhost:9000',
      DEFAULT_SPEAKER: '8',
      COMMAND_PREFIX: '$',
      READING_LIMIT: '250',
    });
    expect(config).toEqual({
      discordToken: 'my-token',
      voicevoxUrl: 'http://localhost:9000',
      defaultSpeaker: 8,
      commandPrefix: '$',
      readingLimit: 250,
    });
  });

  it('coerces numeric values and falls back on non-numeric input (Req 8.5)', () => {
    const config = loadConfig({
      DISCORD_TOKEN: 't',
      DEFAULT_SPEAKER: 'not-a-number',
      READING_LIMIT: 'abc',
    });
    expect(config.defaultSpeaker).toBe(CONFIG_DEFAULTS.defaultSpeaker);
    expect(config.readingLimit).toBe(CONFIG_DEFAULTS.readingLimit);
  });
});
