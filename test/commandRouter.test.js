// @ts-check
import { describe, it, expect } from 'vitest';
import { parseCommand, RECOGNIZED_COMMANDS } from '../src/commands/commandRouter.js';

const NUM_RUNS = 100;
import fc from 'fast-check';

describe('parseCommand', () => {
  // Feature: discord-tts-bot, Property 12: Commands require the prefix
  // For any message content that does not begin with the Command_Prefix,
  // parseCommand returns null (the message is never treated as a command).
  // Validates: Requirements 10.1
  it('Property 12: returns null for any content not beginning with the prefix', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 3 }).filter((p) => p.trim() !== ''),
        fc.string({ maxLength: 40 }),
        (prefix, content) => {
          fc.pre(!content.startsWith(prefix));
          expect(parseCommand(content, prefix)).toBeNull();
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('parses a recognized command with the default prefix', () => {
    expect(parseCommand('!join', '!')).toEqual({ name: 'join', args: [] });
    expect(parseCommand('!voice 8', '!')).toEqual({ name: 'voice', args: ['8'] });
  });

  it('is case-insensitive for the command name', () => {
    expect(parseCommand('!JOIN', '!')).toEqual({ name: 'join', args: [] });
  });

  it('returns a null command name for an unrecognized command (Req 10.3)', () => {
    expect(parseCommand('!frobnicate now', '!')).toEqual({ name: null, args: ['now'] });
  });

  it('returns a null command name for the bare prefix', () => {
    expect(parseCommand('!', '!')).toEqual({ name: null, args: [] });
    expect(parseCommand('!   ', '!')).toEqual({ name: null, args: [] });
  });

  it('recognizes every command in RECOGNIZED_COMMANDS', () => {
    for (const cmd of RECOGNIZED_COMMANDS) {
      expect(parseCommand(`!${cmd}`, '!')).toEqual({ name: cmd, args: [] });
    }
  });

  it('supports a multi-character prefix', () => {
    expect(parseCommand('!!help', '!!')).toEqual({ name: 'help', args: [] });
  });
});
