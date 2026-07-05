// @ts-check

/**
 * @file Per-guild session ownership (Requirements 1, 2, 5).
 *
 * The `SessionManager` holds at most one {@link import('./models.js').Session}
 * per guild. Sessions are created when a user issues `join`, moved/relinked when
 * `join` is issued again from another voice channel, and torn down on `leave`
 * or when the voice channel empties of humans.
 *
 * The manager is deliberately decoupled from the concrete Discord / voice
 * libraries: it receives a `voiceService` (join/leave) and a `createController`
 * factory via its constructor, so its lifecycle behavior is unit-testable with
 * lightweight fakes.
 */

import { PlaybackQueue } from '../playback/playbackQueue.js';
import { LEAVE_CONFIRM, EMPTY_CHANNEL_LEAVE } from '../text/messages.js';

/**
 * @typedef {import('./models.js').Session} Session
 */

/**
 * @typedef {Object} JoinParams
 * @property {string} voiceChannelId       The target voice channel id.
 * @property {string} linkedTextChannelId  The text channel to read aloud (Req 1.2).
 * @property {(content: string) => Promise<any>} send Posts a message to the linked text channel.
 * @property {any} [joinOptions] Opaque options forwarded to `voiceService.join`
 *   (e.g. `{ guildId, channelId, adapterCreator }`).
 */

export class SessionManager {
  /**
   * @param {Object} deps
   * @param {{ defaultSpeaker: number, readingLimit?: number }} deps.config Loaded configuration.
   * @param {{ join: (opts: any) => { connection: any, player: any }, leave: (connection: any) => void }} deps.voiceService
   *   Thin wrapper over `@discordjs/voice` join/leave.
   * @param {(session: Session) => any} deps.createController Factory that builds the
   *   AudioPlaybackController for a freshly created session.
   */
  constructor({ config, voiceService, createController }) {
    /** @private */
    this._config = config;
    /** @private */
    this._voiceService = voiceService;
    /** @private */
    this._createController = createController;
    /** @private @type {Map<string, Session>} */
    this._sessions = new Map();
  }

  /**
   * Create a session on first join, or move + relink an existing one on rejoin
   * (Req 1.1, 1.5).
   *
   * @param {string} guildId
   * @param {JoinParams} params
   * @returns {Session}
   */
  getOrCreate(guildId, params) {
    const existing = this._sessions.get(guildId);
    if (existing) {
      // Rejoin: move the connection to the new channel and relink the text
      // channel (Req 1.5). Re-invoking join with the same guild moves the
      // existing voice connection; the running player is reused so the
      // controller's Idle subscription stays intact.
      const { connection, player } = this._voiceService.join({
        ...(params.joinOptions || {}),
        player: existing.player,
      });
      existing.connection = connection;
      if (player) {
        existing.player = player;
      }
      existing.voiceChannelId = params.voiceChannelId;
      existing.linkedTextChannelId = params.linkedTextChannelId;
      existing.send = params.send;
      return existing;
    }

    const { connection, player } = this._voiceService.join(params.joinOptions);

    /** @type {Session} */
    const session = {
      guildId,
      voiceChannelId: params.voiceChannelId,
      linkedTextChannelId: params.linkedTextChannelId,
      speakerId: this._config.defaultSpeaker, // Req 5.2
      connection,
      player,
      queue: new PlaybackQueue(),
      controller: null,
      send: params.send,
    };

    // The controller needs a reference to the session (queue, player, speakerId,
    // send); wire it up after the session object exists.
    session.controller = this._createController(session);

    this._sessions.set(guildId, session);
    return session;
  }

  /**
   * @param {string} guildId
   * @returns {Session | undefined}
   */
  get(guildId) {
    return this._sessions.get(guildId);
  }

  /**
   * @param {string} guildId
   * @returns {boolean} Whether a session currently exists for the guild.
   */
  has(guildId) {
    return this._sessions.has(guildId);
  }

  /**
   * End a session: clear the queue (Req 2.2), stop playback, disconnect the
   * voice connection (Req 2.1), remove the session, and post the
   * reason-appropriate confirmation (Req 2.3 / 2.6).
   *
   * Posting the confirmation is best-effort: a failed post is logged/swallowed
   * so it never crashes the process.
   *
   * @param {string} guildId
   * @param {'command' | 'empty-channel'} reason
   * @returns {Promise<boolean>} `true` if a session existed and was ended.
   */
  async end(guildId, reason) {
    const session = this._sessions.get(guildId);
    if (!session) {
      return false; // Req 2.4 (no active session) handled by the caller.
    }

    // Clear the queue and stop playback before disconnecting (Req 2.2).
    try {
      session.queue.clear();
    } catch {
      /* ignore */
    }
    try {
      session.controller?.stopAll();
    } catch {
      /* ignore */
    }
    try {
      this._voiceService.leave(session.connection); // Req 2.1
    } catch {
      /* ignore */
    }

    this._sessions.delete(guildId);

    const message = reason === 'empty-channel' ? EMPTY_CHANNEL_LEAVE : LEAVE_CONFIRM;
    try {
      await session.send(message); // Req 2.3 / 2.6
    } catch {
      /* best-effort: never crash on a failed post */
    }

    return true;
  }
}
