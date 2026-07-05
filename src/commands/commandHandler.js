// @ts-check

/**
 * @file Command handler + dispatch (Requirements 1, 2, 4, 5, 10).
 *
 * `CommandHandler` executes the seven recognized commands (join, leave, skip,
 * clear, voice, voices, help) and posts their responses. The `handle` method
 * wires a {@link import('./commandRouter.js').ParsedCommand} to the matching
 * method and produces the unrecognized-command response for a prefixed message
 * that names no recognized command (Req 10.3).
 *
 * The handler consumes a `CommandContext` built by the message listener so it
 * never touches raw Discord objects directly, keeping every branch testable.
 */

import {
  JOIN_CONFIRM,
  NOT_IN_VOICE,
  NO_ACTIVE_SESSION,
  QUEUE_CLEARED,
  invalidSpeakerMessage,
  formatSpeakerListChunks,
  voiceChangedMessage,
  helpMessage,
  unrecognizedCommandMessage,
} from '../text/messages.js';

/**
 * @typedef {Object} CommandContext
 * @property {string} guildId                 The guild the command came from.
 * @property {string | null} voiceChannelId   The requester's current voice channel (null if none).
 * @property {string} textChannelId           The text channel the command was posted in.
 * @property {any} adapterCreator             The guild voice adapter creator (for joining).
 * @property {(content: string) => Promise<any>} send Posts a message to the command's text channel.
 * @property {string[]} args                  Parsed command arguments.
 */

export class CommandHandler {
  /**
   * @param {Object} deps
   * @param {import('../session/sessionManager.js').SessionManager} deps.sessionManager
   * @param {{ isValidSpeaker: (id: number) => Promise<boolean>, listSpeakers: () => Promise<any[]> }} deps.voicevoxClient
   * @param {{ commandPrefix: string, defaultSpeaker: number }} deps.config
   */
  constructor({ sessionManager, voicevoxClient, config }) {
    /** @private */
    this._sessions = sessionManager;
    /** @private */
    this._voicevox = voicevoxClient;
    /** @private */
    this._config = config;
  }

  /**
   * Dispatch a parsed command to its handler (Req 10.3 for unrecognized).
   *
   * @param {import('./commandRouter.js').ParsedCommand} parsed
   * @param {CommandContext} ctx
   * @returns {Promise<void>}
   */
  async handle(parsed, ctx) {
    ctx.args = (parsed && parsed.args) || [];
    if (!parsed || parsed.name === null) {
      // Prefixed but names no recognized command (Req 10.3).
      await this._safeSend(ctx.send, unrecognizedCommandMessage(this._config.commandPrefix));
      return;
    }
    switch (parsed.name) {
      case 'join':
        return this.join(ctx);
      case 'leave':
        return this.leave(ctx);
      case 'skip':
        return this.skip(ctx);
      case 'clear':
        return this.clear(ctx);
      case 'voice':
        return this.voice(ctx);
      case 'voices':
        return this.voices(ctx);
      case 'help':
        return this.help(ctx);
      default:
        await this._safeSend(ctx.send, unrecognizedCommandMessage(this._config.commandPrefix));
    }
  }

  /**
   * Join / move to the requester's voice channel and start / relink the session
   * (Req 1.1, 1.2, 1.3, 1.4, 1.5).
   * @param {CommandContext} ctx
   */
  async join(ctx) {
    if (!ctx.voiceChannelId) {
      await this._safeSend(ctx.send, NOT_IN_VOICE); // Req 1.4
      return;
    }
    this._sessions.getOrCreate(ctx.guildId, {
      voiceChannelId: ctx.voiceChannelId,
      linkedTextChannelId: ctx.textChannelId, // Req 1.2
      send: ctx.send,
      joinOptions: {
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
        adapterCreator: ctx.adapterCreator,
      },
    });
    await this._safeSend(ctx.send, JOIN_CONFIRM); // Req 1.3
  }

  /**
   * Leave the voice channel and end the session, or report no active session
   * (Req 2.1, 2.3, 2.4). The end confirmation is posted by the session manager.
   * @param {CommandContext} ctx
   */
  async leave(ctx) {
    const ended = await this._sessions.end(ctx.guildId, 'command');
    if (!ended) {
      await this._safeSend(ctx.send, NO_ACTIVE_SESSION); // Req 2.4
    }
  }

  /**
   * Skip the current item and advance (Req 4.4, 4.5, 10.4).
   * @param {CommandContext} ctx
   */
  async skip(ctx) {
    const session = this._sessions.get(ctx.guildId);
    if (!session) {
      await this._safeSend(ctx.send, NO_ACTIVE_SESSION);
      return;
    }
    session.controller.skip();
  }

  /**
   * Clear the message queue (Req 10.5).
   * @param {CommandContext} ctx
   */
  async clear(ctx) {
    const session = this._sessions.get(ctx.guildId);
    if (!session) {
      await this._safeSend(ctx.send, NO_ACTIVE_SESSION);
      return;
    }
    session.queue.clear(); // Req 10.5
    await this._safeSend(ctx.send, QUEUE_CLEARED);
  }

  /**
   * Change the session's Speaker_ID (Req 5.3, 5.4).
   *
   * On a valid id the session speaker updates and a confirmation is posted. On
   * an invalid id the previous speaker is retained and the available ids are
   * posted; the speaker stays retained even if that post fails (Req 5.4 /
   * Property 10).
   * @param {CommandContext} ctx
   */
  async voice(ctx) {
    const session = this._sessions.get(ctx.guildId);
    if (!session) {
      await this._safeSend(ctx.send, NO_ACTIVE_SESSION);
      return;
    }

    const raw = ctx.args[0];
    const id = Number(raw);
    const isNumeric = raw !== undefined && raw !== '' && Number.isFinite(id);

    let valid = false;
    if (isNumeric) {
      try {
        valid = await this._voicevox.isValidSpeaker(id);
      } catch {
        valid = false;
      }
    }

    if (valid) {
      session.speakerId = id; // Req 5.3
      await this._safeSend(ctx.send, voiceChangedMessage(id));
      return;
    }

    // Invalid: retain the previous speaker (do NOT mutate session.speakerId) and
    // post a short message directing the user to `!voices`. The retention holds
    // even if the post fails (Property 10). No listSpeakers() call is needed
    // here — the short message avoids Discord's 2000-char limit entirely.
    await this._safeSend(ctx.send, invalidSpeakerMessage()); // Req 5.4
  }

  /**
   * List the available voices (Req 5.5).
   *
   * The catalogue can exceed Discord's 2000-character message limit, so it is
   * split into chunks and posted as several messages via {@link _safeSendChunks}.
   * @param {CommandContext} ctx
   */
  async voices(ctx) {
    let speakers = [];
    try {
      speakers = await this._voicevox.listSpeakers();
    } catch {
      await this._safeSend(ctx.send, 'ボイス一覧の取得に失敗しました。VOICEVOXが起動しているか確認してください。');
      return;
    }
    await this._safeSendChunks(ctx.send, formatSpeakerListChunks(speakers)); // Req 5.5
  }

  /**
   * Post the help text (Req 10.2).
   * @param {CommandContext} ctx
   */
  async help(ctx) {
    await this._safeSend(ctx.send, helpMessage(this._config.commandPrefix)); // Req 10.2
  }

  /**
   * Post a message, swallowing failures so a failed post never crashes the
   * process or mutates session state (design "Command Errors").
   *
   * @private
   * @param {(content: string) => Promise<any>} send
   * @param {string} content
   */
  async _safeSend(send, content) {
    try {
      await send(content);
    } catch {
      /* best-effort */
    }
  }

  /**
   * Post an ordered sequence of message chunks, each via {@link _safeSend} so a
   * single failed post never aborts the rest or crashes the process. Used to
   * deliver a long speaker catalogue that exceeds Discord's per-message limit.
   *
   * @private
   * @param {(content: string) => Promise<any>} send
   * @param {string[]} chunks
   */
  async _safeSendChunks(send, chunks) {
    for (const chunk of chunks) {
      await this._safeSend(send, chunk);
    }
  }
}
