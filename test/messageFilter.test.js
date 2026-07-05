// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shouldRead } from '../src/discord/messageFilter.js';

const NUM_RUNS = 100;

describe('shouldRead', () => {
  // Feature: discord-tts-bot, Property 1: Message filter correctness
  // shouldRead returns true iff the message is from the Linked_Text_Channel, its
  // author is not the bot itself, its author is not a bot account, and its
  // content does not begin with the Command_Prefix.
  // Validates: Requirements 3.3, 3.4, 3.5
  it('Property 1: accepts a message iff all four conditions hold', () => {
    const idArb = fc.integer({ min: 1, max: 20 }).map(String);
    const prefixArb = fc.constantFrom('!', '?', '.', '/tts ');
    // Content that may or may not start with the prefix.
    fc.assert(
      fc.property(
        fc.record({
          authorId: idArb,
          authorIsBot: fc.boolean(),
          botUserId: idArb,
          linkedChannelId: idArb,
          channelId: idArb,
          prefix: prefixArb,
          startsWithPrefix: fc.boolean(),
          body: fc.string({ maxLength: 20 }),
        }),
        (g) => {
          const content = g.startsWithPrefix ? g.prefix + g.body : g.body;
          const msg = {
            authorId: g.authorId,
            authorIsBot: g.authorIsBot,
            botUserId: g.botUserId,
            content,
            channelId: g.channelId,
          };
          const session = { linkedTextChannelId: g.linkedChannelId };
          const result = shouldRead(msg, session, g.prefix);

          const expected =
            g.channelId === g.linkedChannelId &&
            g.authorId !== g.botUserId &&
            !g.authorIsBot &&
            !content.startsWith(g.prefix);

          expect(result).toBe(expected);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('accepts a normal human message in the linked channel', () => {
    const msg = {
      authorId: 'u1',
      authorIsBot: false,
      botUserId: 'bot',
      content: 'hello everyone',
      channelId: 'c1',
    };
    expect(shouldRead(msg, { linkedTextChannelId: 'c1' }, '!')).toBe(true);
  });

  it('rejects messages from a different channel', () => {
    const msg = {
      authorId: 'u1',
      authorIsBot: false,
      botUserId: 'bot',
      content: 'hi',
      channelId: 'other',
    };
    expect(shouldRead(msg, { linkedTextChannelId: 'c1' }, '!')).toBe(false);
  });

  it("rejects the bot's own messages and other bots", () => {
    const base = { botUserId: 'bot', content: 'hi', channelId: 'c1' };
    expect(
      shouldRead({ ...base, authorId: 'bot', authorIsBot: true }, { linkedTextChannelId: 'c1' }, '!')
    ).toBe(false);
    expect(
      shouldRead(
        { ...base, authorId: 'other-bot', authorIsBot: true },
        { linkedTextChannelId: 'c1' },
        '!'
      )
    ).toBe(false);
  });

  it('rejects command messages that begin with the prefix', () => {
    const msg = {
      authorId: 'u1',
      authorIsBot: false,
      botUserId: 'bot',
      content: '!join',
      channelId: 'c1',
    };
    expect(shouldRead(msg, { linkedTextChannelId: 'c1' }, '!')).toBe(false);
  });
});
