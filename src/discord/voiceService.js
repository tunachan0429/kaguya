// @ts-check

/**
 * @file Thin wrapper over `@discordjs/voice` join / leave (Requirements 1.1, 2.1).
 *
 * `VoiceService` isolates the two voice-transport operations the rest of the bot
 * needs — establishing a connection with an audio player, and tearing it down —
 * behind a tiny synchronous interface. The `@discordjs/voice` primitives are
 * injected via the constructor so this module has no hard dependency on the
 * library and the join/leave behavior is testable with fakes; the production
 * entry point (`src/index.js`) imports the real functions and passes them in.
 */

export class VoiceService {
  /**
   * @param {Object} deps
   * @param {(options: any) => any} deps.joinVoiceChannel `@discordjs/voice` joinVoiceChannel.
   * @param {() => any} deps.createAudioPlayer `@discordjs/voice` createAudioPlayer.
   */
  constructor({ joinVoiceChannel, createAudioPlayer }) {
    if (typeof joinVoiceChannel !== 'function' || typeof createAudioPlayer !== 'function') {
      throw new Error('VoiceService requires joinVoiceChannel and createAudioPlayer.');
    }
    /** @private */
    this._joinVoiceChannel = joinVoiceChannel;
    /** @private */
    this._createAudioPlayer = createAudioPlayer;
  }

  /**
   * Join (or move to) a voice channel and ensure an audio player is subscribed
   * to the connection (Req 1.1). Re-invoking with the same `guildId` moves the
   * existing connection to the new channel; pass the existing `player` to reuse
   * it so an in-flight playback subscription is preserved (Req 1.5).
   *
   * @param {Object} params
   * @param {string} params.guildId
   * @param {string} params.channelId
   * @param {any} params.adapterCreator The guild's voice adapter creator.
   * @param {any} [params.player] Existing audio player to reuse on a move.
   * @param {boolean} [params.selfDeaf] Whether to join self-deafened (default true).
   * @returns {{ connection: any, player: any }}
   */
  join({ guildId, channelId, adapterCreator, player, selfDeaf = true }) {
    const connection = this._joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator,
      selfDeaf,
    });
    const activePlayer = player || this._createAudioPlayer();
    if (connection && typeof connection.subscribe === 'function') {
      connection.subscribe(activePlayer);
    }
    return { connection, player: activePlayer };
  }

  /**
   * Destroy a voice connection, ending the session's transport (Req 2.1).
   * Best-effort: a connection that is already destroyed never throws.
   *
   * @param {any} connection
   */
  leave(connection) {
    if (connection && typeof connection.destroy === 'function') {
      try {
        connection.destroy();
      } catch {
        /* already destroyed / invalid state — ignore */
      }
    }
  }
}
