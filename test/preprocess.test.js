// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { preprocess } from '../src/text/preprocess.js';
import {
  URL_PLACEHOLDER,
  CODE_BLOCK_PLACEHOLDER,
  OMISSION_PLACEHOLDER,
} from '../src/text/placeholders.js';

const NUM_RUNS = 100;
const BIG_LIMIT = 100000;

// Safe "word" tokens: contain no URL / mention / emoji / code-block patterns and
// no whitespace, so joining them with single spaces yields already-normalized
// clean text.
const WORD_POOL = ['hello', 'world', 'foo', 'bar', 'test', 'abc', 'neko', 'ねこ', 'ok', 'x'];
const safeWord = fc.constantFrom(...WORD_POOL);
const cleanText = fc
  .array(safeWord, { minLength: 1, maxLength: 8 })
  .map((words) => words.join(' '));

const idArb = fc.integer({ min: 1, max: 999999999 }).map(String);
const nameArb = fc.constantFrom('Alice', 'Bob', 'general', 'staff', 'lounge', 'ねこ部屋');
const emojiNameArb = fc.constantFrom('smile', 'wave', 'heart', 'wow', 'neko123', 'party_time');
const urlArb = fc.webUrl();

describe('preprocess', () => {
  // Feature: discord-tts-bot, Property 3: URL replacement removes URLs
  // For any input string containing one or more URLs, the output contains no
  // URL substring and contains the fixed URL placeholder in each URL's position.
  // Validates: Requirements 6.1
  it('Property 3: replaces every URL with the URL placeholder', () => {
    fc.assert(
      fc.property(
        fc.array(safeWord, { maxLength: 5 }),
        fc.array(urlArb, { minLength: 1, maxLength: 4 }),
        fc.array(safeWord, { maxLength: 5 }),
        (before, urls, after) => {
          const input = [...before, ...urls, ...after].join(' ');
          const out = preprocess(input, {}, BIG_LIMIT);
          expect(out).toContain(URL_PLACEHOLDER);
          for (const url of urls) {
            expect(out.includes(url)).toBe(false);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 4: Mention replacement resolves display names
  // For any input string containing user/role/channel mentions whose IDs are in
  // the MentionTable, the output contains the display names and none of the raw
  // mention tokens.
  // Validates: Requirements 6.2
  it('Property 4: resolves mentions to display names and removes raw tokens', () => {
    const mentionEntry = fc.record({
      kind: fc.constantFrom('user', 'role', 'channel'),
      id: idArb,
      name: nameArb,
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(mentionEntry, {
          minLength: 1,
          maxLength: 5,
          selector: (e) => e.id,
        }),
        (entries) => {
          /** @type {{users:Record<string,string>,roles:Record<string,string>,channels:Record<string,string>}} */
          const table = { users: {}, roles: {}, channels: {} };
          const tokens = [];
          for (const e of entries) {
            if (e.kind === 'user') {
              table.users[e.id] = e.name;
              tokens.push(`<@${e.id}>`);
            } else if (e.kind === 'role') {
              table.roles[e.id] = e.name;
              tokens.push(`<@&${e.id}>`);
            } else {
              table.channels[e.id] = e.name;
              tokens.push(`<#${e.id}>`);
            }
          }
          const input = `hello ${tokens.join(' ')} world`;
          const out = preprocess(input, table, BIG_LIMIT);
          for (const e of entries) {
            expect(out).toContain(e.name);
          }
          for (const token of tokens) {
            expect(out.includes(token)).toBe(false);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 5: Custom emoji replacement uses emoji name
  // For any input containing custom emoji tokens (<:name:id> or <a:name:id>), the
  // output contains each emoji's name and none of the raw emoji tokens.
  // Validates: Requirements 6.3
  it('Property 5: replaces custom emoji tokens with their name', () => {
    const emojiTok = fc.record({
      animated: fc.boolean(),
      name: emojiNameArb,
      id: idArb,
    });
    fc.assert(
      fc.property(
        fc.array(emojiTok, { minLength: 1, maxLength: 5 }),
        (emojis) => {
          const tokens = emojis.map(
            (e) => `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`
          );
          const input = `see ${tokens.join(' ')} bye`;
          const out = preprocess(input, {}, BIG_LIMIT);
          for (const e of emojis) {
            expect(out).toContain(e.name);
          }
          for (const token of tokens) {
            expect(out.includes(token)).toBe(false);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 6: Code-block replacement removes fenced content
  // For any input containing a fenced code block, the output contains the code
  // placeholder and not the fenced code content.
  // Validates: Requirements 6.4
  it('Property 6: replaces fenced code blocks with the code placeholder', () => {
    const SENTINEL = 'ZZSENTINELZZ';
    fc.assert(
      fc.property(
        fc.array(safeWord, { maxLength: 4 }),
        fc.string({ maxLength: 40 }),
        fc.array(safeWord, { maxLength: 4 }),
        (before, codeInner, after) => {
          const codeBlock = '```\n' + codeInner + SENTINEL + '\n```';
          const input = `${before.join(' ')} ${codeBlock} ${after.join(' ')}`;
          const out = preprocess(input, {}, BIG_LIMIT);
          expect(out).toContain(CODE_BLOCK_PLACEHOLDER);
          expect(out.includes('```')).toBe(false);
          expect(out.includes(SENTINEL)).toBe(false);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 7: Output length is bounded
  // For any input, the output length does not exceed the reading limit, and any
  // input whose spoken form is truncated ends with the omission placeholder.
  // Validates: Requirements 6.5, 7.4
  it('Property 7: output length never exceeds the reading limit', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.string({ maxLength: 500 }),
          // occasional very long inputs
          fc.array(fc.char(), { minLength: 200, maxLength: 600 }).map((a) => a.join('')),
          fc.constant(''),
          fc.constant('   \n\t  ')
        ),
        fc.integer({ min: 10, max: 200 }),
        (input, limit) => {
          const out = preprocess(input, {}, limit);
          expect(out.length).toBeLessThanOrEqual(limit);
          const full = preprocess(input, {}, BIG_LIMIT);
          if (full.length > limit) {
            expect(out.endsWith(OMISSION_PLACEHOLDER)).toBe(true);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 8: Clean, within-limit input is unchanged
  // For any input with no URLs/mentions/emoji/code blocks within the reading
  // limit, preprocess returns that string unchanged.
  // Validates: Requirements 7.2
  it('Property 8: returns clean, within-limit input unchanged', () => {
    fc.assert(
      fc.property(cleanText, (input) => {
        const limit = input.length + 50;
        const out = preprocess(input, {}, limit);
        expect(out).toBe(input);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: discord-tts-bot, Property 9: Preprocessing is idempotent
  // For any input, preprocess(preprocess(x)) === preprocess(x).
  // Validates: Requirements 7.3
  it('Property 9: preprocessing is idempotent', () => {
    // Build inputs from space-separated components so tokens are well-formed and
    // isolated, plus some entirely arbitrary strings.
    const component = fc.oneof(
      safeWord,
      urlArb,
      idArb.map((id) => `<@${id}>`),
      idArb.map((id) => `<#${id}>`),
      fc.record({ name: emojiNameArb, id: idArb }).map((e) => `<:${e.name}:${e.id}>`),
      fc.string({ maxLength: 15 }).map((s) => '```' + s + '```')
    );
    const structured = fc.array(component, { maxLength: 12 }).map((c) => c.join(' '));

    fc.assert(
      fc.property(
        fc.oneof(structured, fc.string(), fc.fullUnicodeString()),
        fc.integer({ min: 10, max: 150 }),
        (input, limit) => {
          const once = preprocess(input, {}, limit);
          const twice = preprocess(once, {}, limit);
          expect(twice).toBe(once);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // --- Unit tests ---

  // Task 3.10: empty-result discard case (Req 6.6)
  it('returns an empty string when nothing readable remains (Req 6.6)', () => {
    expect(preprocess('', {}, 100)).toBe('');
    expect(preprocess('    \n\t  ', {}, 100)).toBe('');
    // A message that is only an unresolved mention reduces to nothing.
    expect(preprocess('<@123456>', {}, 100)).toBe('');
  });

  it('leaves a simple clean sentence unchanged (Req 7.2)', () => {
    expect(preprocess('hello world', {}, 100)).toBe('hello world');
  });

  it('truncates over-limit text with the omission placeholder (Req 6.5)', () => {
    const input = 'a'.repeat(500);
    const out = preprocess(input, {}, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith(OMISSION_PLACEHOLDER)).toBe(true);
  });
});
