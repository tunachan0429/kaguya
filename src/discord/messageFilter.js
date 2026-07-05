// @ts-check

/**
 * @file Message filter predicate (Requirements 3.3, 3.4, 3.5).
 *
 * Pure decision function used by the message listener to decide whether an
 * incoming Discord message should be read aloud.
 */

/**
 * @typedef {Object} FilterMessage
 * @property {string} authorId    ID of the message author.
 * @property {boolean} authorIsBot Whether the author is a bot account.
 * @property {string} botUserId   The TTS bot's own user ID.
 * @property {string} content     The raw message content.
 * @property {string} channelId   ID of the channel the message was posted in.
 */

/**
 * @typedef {Object} FilterSession
 * @property {string} linkedTextChannelId The channel whose messages are read aloud.
 */

/**
 * Decide whether a message should be read aloud.
 *
 * Returns `true` only when ALL hold:
 *  - the message is from the Linked_Text_Channel,
 *  - the author is not the bot itself (Req 3.3 — excluded via own user ID),
 *  - the author is not another bot account (Req 3.4),
 *  - the content does not begin with the Command_Prefix (Req 3.5).
 *
 * @param {FilterMessage} msg
 * @param {FilterSession} session
 * @param {string} commandPrefix
 * @returns {boolean}
 */
export function shouldRead(msg, session, commandPrefix) {
  if (!msg || !session) return false;
  if (msg.channelId !== session.linkedTextChannelId) return false;
  if (msg.authorId === msg.botUserId) return false; // Req 3.3
  if (msg.authorIsBot) return false; // Req 3.4
  if (typeof msg.content === 'string' && msg.content.startsWith(commandPrefix)) {
    return false; // Req 3.5
  }
  return true;
}
