// @ts-check

/**
 * @file Main entry point and startup wiring (Requirements 8.3, 9.1, 9.2, 9.3).
 *
 * The startup sequence:
 *   1. Load configuration; a missing Discord token logs an identifying error and
 *      exits with a non-zero status code (Req 8.3).
 *   2. Health-check the VOICEVOX Engine: log a success message on success
 *      (Req 9.2), or an instruction to start VOICEVOX on failure (Req 9.3) —
 *      startup continues either way since the engine may come up later.
 *   3. Construct the client, services, session manager, and command handler.
 *   4. Register the `messageCreate` and `voiceStateUpdate` listeners on a
 *      discord.js v14 Client with the required Gateway intents, then log in.
 *
 * {@link startBot} takes its heavyweight collaborators (discord.js and
 * `@discordjs/voice`) via injection so the wiring is integration-testable with
 * mocked boundaries. When this file is executed directly, the real libraries are
 * dynamically imported and passed in.
 */

import { loadConfig, MissingTokenError } from './config/configLoader.js';
import { VoicevoxClient } from './voicevox/voicevoxClient.js';
import { VoiceService } from './discord/voiceService.js';
import { SessionManager } from './session/sessionManager.js';
import { AudioPlaybackController } from './playback/audioPlaybackController.js';
import { CommandHandler } from './commands/commandHandler.js';
import { createMessageListener } from './events/messageListener.js';
import { createVoiceStateListener } from './events/voiceStateListener.js';

/**
 * @typedef {Object} StartBotDeps
 * @property {Record<string, string | undefined>} [env] Environment to load config from.
 * @property {{ Client: any, GatewayIntentBits: any, Events: any }} discord discord.js exports.
 * @property {{ joinVoiceChannel: Function, createAudioPlayer: Function, createAudioResource: Function, AudioPlayerStatus: any }} voice
 *   `@discordjs/voice` exports.
 * @property {(url: string) => any} [createVoicevoxClient] Factory for the VOICEVOX client.
 * @property {{ log: Function, error: Function }} [logger] Logger (defaults to console).
 * @property {(code: number) => void} [exit] Process-exit function (defaults to process.exit).
 */

/**
 * Run the startup sequence and wire the bot.
 *
 * @param {StartBotDeps} deps
 * @returns {Promise<undefined | { client: any, config: any, sessionManager: SessionManager, commandHandler: CommandHandler, voicevoxClient: any }>}
 *   The wired objects, or `undefined` when startup aborted (missing token).
 */
export async function startBot(deps) {
  const {
    env = process.env,
    discord,
    voice,
    createVoicevoxClient,
    logger = console,
    exit = (code) => process.exit(code),
  } = deps;

  // 1. Configuration (Req 8.3).
  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    if (err instanceof MissingTokenError) {
      logger.error(`[config] ${err.message}`);
      exit(1);
      return undefined;
    }
    throw err;
  }

  // 2. VOICEVOX health check (Req 9.1-9.3).
  const voicevoxClient = createVoicevoxClient
    ? createVoicevoxClient(config.voicevoxUrl)
    : new VoicevoxClient(config.voicevoxUrl);

  const healthy = await voicevoxClient.healthCheck();
  if (healthy) {
    logger.log(`[voicevox] Connected to VOICEVOX Engine at ${config.voicevoxUrl}.`); // Req 9.2
  } else {
    logger.error(
      `[voicevox] Could not reach VOICEVOX Engine at ${config.voicevoxUrl}. ` +
        'Please start VOICEVOX Engine, then post a message to try synthesis again.'
    ); // Req 9.3 (non-fatal)
  }

  // 3. Construct the client + services.
  const { Client, GatewayIntentBits, Events } = discord;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const voiceService = new VoiceService({
    joinVoiceChannel: voice.joinVoiceChannel,
    createAudioPlayer: voice.createAudioPlayer,
  });

  /** @param {import('./session/models.js').Session} session */
  const createController = (session) =>
    new AudioPlaybackController({
      session,
      voicevoxClient,
      readingLimit: config.readingLimit,
      createAudioResource: voice.createAudioResource,
      idleStatus: voice.AudioPlayerStatus.Idle,
    });

  const sessionManager = new SessionManager({ config, voiceService, createController });
  const commandHandler = new CommandHandler({ sessionManager, voicevoxClient, config });

  const messageListener = createMessageListener({ client, config, sessionManager, commandHandler });
  const voiceStateListener = createVoiceStateListener({ sessionManager });

  // 4. Register listeners and log in.
  client.on(Events.MessageCreate, messageListener);
  client.on(Events.VoiceStateUpdate, voiceStateListener);
  client.once(Events.ClientReady, (c) => {
    const tag = c && c.user && c.user.tag ? c.user.tag : 'bot';
    logger.log(`[discord] Logged in as ${tag}.`);
  });

  await client.login(config.discordToken);

  return { client, config, sessionManager, commandHandler, voicevoxClient };
}

/**
 * Detect whether this module was executed directly (as opposed to imported).
 * @returns {boolean}
 */
async function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    const { pathToFileURL } = await import('node:url');
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

// When run directly, load the real libraries and start the bot.
if (await isMainModule()) {
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    // dotenv is optional at runtime; env vars may be provided by the OS.
  }
  const discord = await import('discord.js');
  const voice = await import('@discordjs/voice');
  await startBot({
    discord: {
      Client: discord.Client,
      GatewayIntentBits: discord.GatewayIntentBits,
      Events: discord.Events,
    },
    voice: {
      joinVoiceChannel: voice.joinVoiceChannel,
      createAudioPlayer: voice.createAudioPlayer,
      createAudioResource: voice.createAudioResource,
      AudioPlayerStatus: voice.AudioPlayerStatus,
    },
  });
}
