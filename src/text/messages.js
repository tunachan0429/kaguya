// @ts-check

/**
 * @file Centralized user-facing message strings posted to Discord text channels.
 *
 * Kept in one place so the wording is consistent and unit-testable. Messages are
 * plain Japanese (the bot's target community language) with the essential
 * information; command names are interpolated with the active Command_Prefix so
 * the help / unrecognized responses reflect the operator's configuration.
 */

/** Confirmation posted after joining a voice channel (Req 1.3). */
export const JOIN_CONFIRM = 'ボイスチャンネルに参加しました。このチャンネルのメッセージを読み上げます。';

/** Instruction posted when the requester is not in a voice channel (Req 1.4). */
export const NOT_IN_VOICE = '先にボイスチャンネルに参加してください。';

/** Confirmation posted after leaving on a `leave` command (Req 2.3). */
export const LEAVE_CONFIRM = 'ボイスチャンネルから退出しました。読み上げを終了します。';

/** Confirmation posted when the session ends because the channel emptied (Req 2.6). */
export const EMPTY_CHANNEL_LEAVE =
  'ボイスチャンネルに誰もいなくなったため、退出しました。読み上げを終了します。';

/** Response posted when `leave` is issued with no active session (Req 2.4). */
export const NO_ACTIVE_SESSION = '現在アクティブな読み上げセッションはありません。';

/** Response posted after clearing the queue (Req 10.5). */
export const QUEUE_CLEARED = '読み上げ待ちのメッセージをすべて削除しました。';

/** Response posted when synthesis fails for an item (Req 9.4). */
export const SYNTHESIS_FAILED =
  '音声の生成に失敗したため、このメッセージの読み上げをスキップしました。';

/**
 * Message posted when an invalid Speaker_ID is requested (Req 5.4).
 *
 * Deliberately short and self-contained: it no longer inlines the full speaker
 * catalogue, because that list can exceed Discord's 2000-character message limit
 * and cause the post to fail silently. Users are directed to `!voices` (which
 * chunks the list) to see the available ids instead.
 *
 * @param {Array<{ name: string, styleId: number, styleName: string }>} [speakers]
 *   Unused; kept optional for backward compatibility with existing callers.
 * @returns {string}
 */
// eslint-disable-next-line no-unused-vars
export function invalidSpeakerMessage(speakers) {
  return '指定されたボイスIDは利用できません。前のボイスのままにします。`!voices` で利用可能なボイス一覧を確認してください。';
}

/**
 * Format the speaker catalogue as a readable list of `id: character (style)`
 * lines (Req 5.5).
 *
 * @param {Array<{ name: string, styleId: number, styleName: string }>} speakers
 * @returns {string}
 */
export function formatSpeakerList(speakers) {
  if (!Array.isArray(speakers) || speakers.length === 0) {
    return '(利用可能なボイスがありません)';
  }
  return speakers
    .map((s) => `${s.styleId}: ${s.name}（${s.styleName}）`)
    .join('\n');
}

/**
 * Format the speaker catalogue like {@link formatSpeakerList}, but split into an
 * array of message chunks each no longer than `maxLen` characters (Req 5.5).
 *
 * VOICEVOX can return 100+ styles whose combined list exceeds Discord's
 * 2000-character message limit; sending it as one message throws and the reply
 * is silently dropped. Splitting on line boundaries (a single line is never
 * split) lets the caller post several messages that each fit the limit.
 *
 * @param {Array<{ name: string, styleId: number, styleName: string }>} speakers
 * @param {number} [maxLen=1900] Maximum characters per chunk (kept under 2000).
 * @returns {string[]} One or more chunk strings; a single placeholder chunk when
 *   there are no speakers.
 */
export function formatSpeakerListChunks(speakers, maxLen = 1900) {
  if (!Array.isArray(speakers) || speakers.length === 0) {
    return ['(利用可能なボイスがありません)'];
  }
  const lines = speakers.map((s) => `${s.styleId}: ${s.name}（${s.styleName}）`);
  /** @type {string[]} */
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current === '') {
      current = line;
    } else if (current.length + 1 + line.length <= maxLen) {
      current += `\n${line}`;
    } else {
      chunks.push(current);
      current = line;
    }
  }
  if (current !== '') {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Confirmation posted after a successful voice change (Req 5.3).
 *
 * @param {number} speakerId
 * @returns {string}
 */
export function voiceChangedMessage(speakerId) {
  return `ボイスをID ${speakerId} に変更しました。`;
}

/**
 * The help text listing every supported command (Req 10.2).
 *
 * @param {string} prefix The active Command_Prefix.
 * @returns {string}
 */
export function helpMessage(prefix) {
  return [
    '使用できるコマンド:',
    `${prefix}join   - あなたのいるボイスチャンネルに参加し、このテキストチャンネルの読み上げを開始します`,
    `${prefix}leave  - ボイスチャンネルから退出し、読み上げを終了します`,
    `${prefix}skip   - 現在読み上げ中のメッセージをスキップします`,
    `${prefix}clear  - 読み上げ待ちのメッセージをすべて削除します`,
    `${prefix}voice <ID> - 読み上げに使うボイス(Speaker_ID)を変更します`,
    `${prefix}voices - 利用可能なボイスの一覧を表示します`,
    `${prefix}help   - このヘルプを表示します`,
  ].join('\n');
}

/**
 * Response for a prefixed message that names no recognized command (Req 10.3).
 *
 * @param {string} prefix The active Command_Prefix.
 * @returns {string}
 */
export function unrecognizedCommandMessage(prefix) {
  return `不明なコマンドです。${prefix}help でコマンド一覧を確認してください。`;
}
