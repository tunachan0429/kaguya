// @ts-check

/**
 * @file Pure text preprocessing transformation (Requirements 6 and 7).
 *
 * `preprocess` maps a raw Discord message string plus a mention-lookup table to
 * a spoken-text string, applying a fixed, deterministic pipeline. It performs no
 * I/O so it is fully unit- and property-testable.
 *
 * Design guarantees:
 *  - Output never exceeds `readingLimit` characters (Req 6.5, 7.4 / Property 7).
 *  - Already-normalized clean input within the limit is returned unchanged
 *    (Req 7.2 / Property 8).
 *  - `preprocess(preprocess(x)) === preprocess(x)` (Req 7.3 / Property 9).
 *  - Input that reduces to nothing readable yields an empty string so the caller
 *    can discard it (Req 6.6).
 */

import {
  URL_PLACEHOLDER,
  CODE_BLOCK_PLACEHOLDER,
  OMISSION_PLACEHOLDER,
} from './placeholders.js';

/**
 * @typedef {Object} MentionTable
 * @property {Record<string, string>} users    Map of userId -> display name.
 * @property {Record<string, string>} roles    Map of roleId -> role name.
 * @property {Record<string, string>} channels Map of channelId -> channel name.
 */

/** Fenced code block, e.g. ```js\ncode\n``` (non-greedy, spans newlines). */
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
/** http/https URL. */
const URL_RE = /https?:\/\/[^\s<]+/gi;
/** Role mention: <@&123>. Checked before user mentions. */
const ROLE_MENTION_RE = /<@&(\d+)>/g;
/** User mention: <@123> or <@!123>. */
const USER_MENTION_RE = /<@!?(\d+)>/g;
/** Channel mention: <#123>. */
const CHANNEL_MENTION_RE = /<#(\d+)>/g;
/** Custom emoji: <:name:123> or animated <a:name:123>. */
const CUSTOM_EMOJI_RE = /<a?:(\w+):\d+>/g;

/**
 * Normalize an (possibly missing) mention table into fully-populated maps.
 *
 * @param {MentionTable | undefined | null} mentions
 * @returns {MentionTable}
 */
function normalizeMentions(mentions) {
  return {
    users: (mentions && mentions.users) || {},
    roles: (mentions && mentions.roles) || {},
    channels: (mentions && mentions.channels) || {},
  };
}

/**
 * Enforce the reading limit so the returned string's length never exceeds
 * `readingLimit`. When truncation occurs and the limit is large enough to hold
 * it, the omission placeholder is appended (Req 6.5 / Property 7). Truncation is
 * performed on whole code points so surrogate pairs are never split.
 *
 * @param {string} text
 * @param {number} readingLimit
 * @returns {string}
 */
function enforceLimit(text, readingLimit) {
  const limit = Number.isFinite(readingLimit) ? Math.max(0, Math.trunc(readingLimit)) : 0;
  if (text.length <= limit) {
    return text;
  }

  // Reserve room for the omission suffix when the limit can accommodate it.
  const suffixLen = OMISSION_PLACEHOLDER.length;
  const budget = limit > suffixLen ? limit - suffixLen : 0;

  let head = '';
  for (const ch of text) {
    if (head.length + ch.length > budget) break;
    head += ch;
  }

  let result = budget > 0 ? head + OMISSION_PLACEHOLDER : OMISSION_PLACEHOLDER;

  // If the limit is too small even for the suffix, hard-cap by code points.
  if (result.length > limit) {
    let capped = '';
    for (const ch of result) {
      if (capped.length + ch.length > limit) break;
      capped += ch;
    }
    result = capped;
  }
  return result;
}

/**
 * Preprocess a raw message into spoken text (Req 6, 7).
 *
 * Transformation order (fixed and deterministic):
 *   1. Replace fenced code blocks with the code placeholder (Req 6.4).
 *   2. Replace URLs with the URL placeholder (Req 6.1).
 *   3. Resolve mentions to display names from the MentionTable (Req 6.2);
 *      mentions not present in the table are removed.
 *   4. Replace custom emojis with their name (Req 6.3).
 *   5. Normalize whitespace (collapse runs to a single space, trim).
 *   6. Truncate to `readingLimit`, appending the omission placeholder (Req 6.5).
 *
 * @param {string} raw          The original message text.
 * @param {MentionTable} [mentions] Resolution table for mentions.
 * @param {number} [readingLimit=100] Maximum spoken characters.
 * @returns {string} Spoken text (empty when nothing readable remains, Req 6.6).
 */
export function preprocess(raw, mentions, readingLimit = 100) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return '';
  }

  const table = normalizeMentions(mentions);
  let text = raw;

  // 1. Fenced code blocks (removes any URLs/mentions/emojis inside them).
  text = text.replace(CODE_BLOCK_RE, ` ${CODE_BLOCK_PLACEHOLDER} `);

  // 2. URLs.
  text = text.replace(URL_RE, ` ${URL_PLACEHOLDER} `);

  // 3. Mentions (role before user; unresolved mentions are removed).
  text = text.replace(ROLE_MENTION_RE, (_m, id) =>
    Object.prototype.hasOwnProperty.call(table.roles, id) ? ` ${table.roles[id]} ` : ' '
  );
  text = text.replace(USER_MENTION_RE, (_m, id) =>
    Object.prototype.hasOwnProperty.call(table.users, id) ? ` ${table.users[id]} ` : ' '
  );
  text = text.replace(CHANNEL_MENTION_RE, (_m, id) =>
    Object.prototype.hasOwnProperty.call(table.channels, id) ? ` ${table.channels[id]} ` : ' '
  );

  // 4. Custom emojis -> emoji name.
  text = text.replace(CUSTOM_EMOJI_RE, (_m, name) => ` ${name} `);

  // 5. Whitespace normalization.
  text = text.replace(/\s+/g, ' ').trim();

  // 6. Length bound.
  return enforceLimit(text, readingLimit);
}
