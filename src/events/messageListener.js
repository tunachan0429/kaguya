// @ts-check

/**
 * @file `messageCreate` listener (Requirements 3.1, 10.1).
 *
 * Routes prefixed messages through {@link parseCommand} to the
 * {@link import('../commands/commandHandler.js').CommandHandler}, and routes
 * plain messages through {@link shouldRead}; accepted plain messages have their
 * mentions resolved, are enqueued as a {@link import('../session/models.js').QueueItem},
 * and trigger the session's playback controller.
 *
 * The listener is created via a factory so its dependencies are injected and it
 * can be unit-tested with plain message-shaped objects instead of live
 * discord.js `Message` instances.
 */

import { parseCommand } from '../commands/commandRouter.js';
import { shouldRead } from '../discord/messageFilter.js';
import { buildMentionTable } from '../session/models.js';

/**
 * @param {Object} deps
 * @param {{ user: { id: string } }} deps.client The discord.js client (for the bot's own id).
 * @param {{ commandPrefix: string }} deps.config
 * @param {import('../session/sessionManager.js').SessionManager} deps.sessionManager
 * @param {import('../commands/commandHandler.js').CommandHandler} deps.commandHandler
 * @returns {(message: any) => Promise<void>} A `messageCreate` handler.
 */
export function createMessageListener({ client, config, sessionManager, commandHandler }) {
  return async function onMessageCreate(message) {
    if (!message || !message.guild) {
      return; // Ignore DMs / non-guild messages.
    }
    // Ignore all bot messages (the bot itself and other bots) for both the
    // command and read-aloud paths (Req 3.3, 3.4).
    if (message.author && message.author.bot) {
      return;
    }

    const content = typeof message.content === 'string' ? message.content : '';
    const parsed = parseCommand(content, config.commandPrefix);

    if (parsed !== null) {
      // Prefixed message -> command path (Req 10.1).
      const ctx = {
        guildId: message.guild.id,
        voiceChannelId:
          (message.member && message.member.voice && message.member.voice.channelId) || null,
        textChannelId: message.channelId,
        adapterCreator: message.guild.voiceAdapterCreator,
        send: (c) => message.channel.send(c),
        args: parsed.args,
      };
      await commandHandler.handle(parsed, ctx);
      return;
    }

    // Plain message -> read-aloud path (Req 3.1). Only relevant with a session.
    const session = sessionManager.get(message.guild.id);
    if (!session) {
      return;
    }

    const botUserId = client.user ? client.user.id : '';
    const filterMsg = {
      authorId: message.author ? message.author.id : '',
      authorIsBot: Boolean(message.author && message.author.bot),
      botUserId,
      content,
      channelId: message.channelId,
    };

    if (!shouldRead(filterMsg, session, config.commandPrefix)) {
      return;
    }

    const item = {
      rawContent: content,
      mentions: buildMentionTable(message),
      enqueuedAt: Date.now(),
    };
    session.queue.enqueue(item); // Req 3.1
    session.controller.notify();
  };
}
