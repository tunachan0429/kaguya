// @ts-check

/**
 * @file Runtime data-model shapes for a voice session plus the
 * {@link buildMentionTable} helper (Requirements 1, 2, 5, 6.2, 7.1).
 *
 * These types describe the per-guild runtime state held by the
 * {@link module:session/sessionManager SessionManager}. The concrete Discord /
 * `@discordjs/voice` objects (`VoiceConnection`, `AudioPlayer`) are treated as
 * opaque here so this module has no hard dependency on those libraries and can
 * be reasoned about (and partially tested) in isolation.
 */

/**
 * @typedef {import('../text/preprocess.js').MentionTable} MentionTable
 */

/**
 * @typedef {Object} QueueItem
 * One pending message awaiting synthesis and playback (Req 3, 4).
 * @property {string} rawContent  The original message text.
 * @property {MentionTable} mentions Resolved mentions captured at enqueue time.
 * @property {number} enqueuedAt  Millisecond timestamp used for ordering / diagnostics.
 */

/**
 * @typedef {Object} Session
 * Per-guild runtime state (Req 1, 2, 5).
 * @property {string} guildId              The Discord guild (server) id.
 * @property {string} voiceChannelId       The connected voice channel id.
 * @property {string} linkedTextChannelId  The text channel whose messages are read aloud (Req 1.2, updated on move Req 1.5).
 * @property {number} speakerId            Current VOICEVOX Speaker_ID (starts at Config.defaultSpeaker, Req 5.2; updatable Req 5.3).
 * @property {any} connection              The `@discordjs/voice` VoiceConnection.
 * @property {any} player                  The `@discordjs/voice` AudioPlayer.
 * @property {import('../playback/playbackQueue.js').PlaybackQueue} queue The FIFO message queue.
 * @property {any} controller              The AudioPlaybackController driving this session.
 * @property {(content: string) => Promise<any>} send Posts a message to the linked text channel.
 */

/**
 * Build a {@link MentionTable} from a Discord.js message so the pure
 * {@link module:text/preprocess preprocess} function can resolve mentions
 * without any Discord objects (Req 6.2, 7.1).
 *
 * Accepts anything shaped like a discord.js Message: `message.mentions` with
 * `users`, `roles`, and `channels` Collections (which extend `Map`), plus an
 * optional `members` Collection used to prefer a member's guild display name.
 * Every field is defensive so malformed / partial inputs never throw.
 *
 * @param {any} message A discord.js Message (or a compatible shape).
 * @returns {MentionTable}
 */
export function buildMentionTable(message) {
  /** @type {MentionTable} */
  const table = { users: {}, roles: {}, channels: {} };

  const mentions = message && message.mentions;
  if (!mentions) {
    return table;
  }

  const members = mentions.members;
  const users = mentions.users;
  if (users && typeof users.forEach === 'function') {
    users.forEach((user, id) => {
      const userId = String(user?.id ?? id);
      let name =
        user?.displayName || user?.globalName || user?.username || userId;
      // Prefer the per-guild member nickname / display name when available.
      if (members && typeof members.get === 'function') {
        const member = members.get(userId);
        if (member && member.displayName) {
          name = member.displayName;
        }
      }
      table.users[userId] = String(name);
    });
  }

  const roles = mentions.roles;
  if (roles && typeof roles.forEach === 'function') {
    roles.forEach((role, id) => {
      const roleId = String(role?.id ?? id);
      table.roles[roleId] = String(role?.name ?? roleId);
    });
  }

  const channels = mentions.channels;
  if (channels && typeof channels.forEach === 'function') {
    channels.forEach((channel, id) => {
      const channelId = String(channel?.id ?? id);
      table.channels[channelId] = String(channel?.name ?? channelId);
    });
  }

  return table;
}
