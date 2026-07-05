// @ts-check

/**
 * @file `voiceStateUpdate` listener (Requirements 2.5, 2.6).
 *
 * When the bot's voice channel no longer contains any human participants, the
 * session is ended and the session-end confirmation is posted (the confirmation
 * is emitted by {@link import('../session/sessionManager.js').SessionManager#end}
 * with the `empty-channel` reason).
 *
 * Created via a factory so it can be unit-tested with plain state-shaped objects.
 */

/**
 * Count the human (non-bot) members currently in a voice channel.
 *
 * @param {any} channel A discord.js VoiceChannel (or compatible shape with a
 *   `members` Collection/Map of GuildMembers).
 * @returns {number}
 */
function countHumans(channel) {
  const members = channel && channel.members;
  if (!members) {
    return 0;
  }
  let count = 0;
  const values = typeof members.values === 'function' ? members.values() : members;
  for (const member of values) {
    const isBot = member && member.user && member.user.bot;
    if (!isBot) {
      count += 1;
    }
  }
  return count;
}

/**
 * @param {Object} deps
 * @param {import('../session/sessionManager.js').SessionManager} deps.sessionManager
 * @returns {(oldState: any, newState: any) => Promise<void>} A `voiceStateUpdate` handler.
 */
export function createVoiceStateListener({ sessionManager }) {
  return async function onVoiceStateUpdate(oldState, newState) {
    const guild = (newState && newState.guild) || (oldState && oldState.guild);
    if (!guild) {
      return;
    }
    const session = sessionManager.get(guild.id);
    if (!session) {
      return; // No active session in this guild.
    }

    const channels = guild.channels;
    const channel =
      channels && typeof channels.cache?.get === 'function'
        ? channels.cache.get(session.voiceChannelId)
        : channels && typeof channels.get === 'function'
          ? channels.get(session.voiceChannelId)
          : undefined;

    // If the bot's channel is gone, treat it as empty and end the session.
    const humans = channel ? countHumans(channel) : 0;
    if (humans === 0) {
      await sessionManager.end(guild.id, 'empty-channel'); // Req 2.5, 2.6
    }
  };
}
