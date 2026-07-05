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
 * Message posted when an invalid Speaker_ID is requested; lists the available
 * ids so the user can pick a valid one (Req 5.4).
 *
 * @param {Array<{ name: string, styleId: number, styleName: string }>} speakers
 * @returns {string}
 */
export function invalidSpeakerMessage(speakers) {
  const list = formatSpeakerList(speakers);
  return `指定されたボイスIDは利用できません。前のボイスのままにします。利用可能なボイス:\n${list}`;
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
