// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { startBot } from '../src/index.js';

/** Fake discord.js Client that records listener registration and login. */
class FakeClient {
  constructor(options) {
    this.options = options;
    this.handlers = {};
    this.onceHandlers = {};
    this.loggedInWith = null;
  }
  on(event, fn) {
    this.handlers[event] = fn;
    return this;
  }
  once(event, fn) {
    this.onceHandlers[event] = fn;
    return this;
  }
  async login(token) {
    this.loggedInWith = token;
    return token;
  }
}

const discord = {
  Client: FakeClient,
  GatewayIntentBits: {
    Guilds: 1,
    GuildVoiceStates: 2,
    GuildMessages: 4,
    MessageContent: 8,
  },
  Events: {
    MessageCreate: 'messageCreate',
    VoiceStateUpdate: 'voiceStateUpdate',
    ClientReady: 'ready',
  },
};

const voice = {
  joinVoiceChannel: () => ({ subscribe() {}, destroy() {} }),
  createAudioPlayer: () => ({ on() {}, play() {}, stop() {} }),
  createAudioResource: (s) => ({ s }),
  AudioPlayerStatus: { Idle: 'idle' },
};

function makeDeps(overrides = {}) {
  const logger = { log: vi.fn(), error: vi.fn() };
  const exit = vi.fn();
  const createVoicevoxClient = vi.fn(() => ({
    healthCheck: vi.fn(async () => overrides.healthy ?? true),
    isValidSpeaker: vi.fn(async () => false),
    listSpeakers: vi.fn(async () => []),
    synthesize: vi.fn(async () => ({})),
  }));
  return {
    env: overrides.env ?? { DISCORD_TOKEN: 'tok', VOICEVOX_URL: 'http://localhost:50021' },
    discord,
    voice,
    createVoicevoxClient,
    logger,
    exit,
  };
}

describe('startBot', () => {
  it('exits with code 1 and logs when the Discord token is missing (Req 8.3)', async () => {
    const deps = makeDeps({ env: { VOICEVOX_URL: 'http://localhost:50021' } });
    const result = await startBot(deps);
    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.logger.error).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('logs the success message and registers listeners on a healthy engine (Req 9.1, 9.2)', async () => {
    const deps = makeDeps({ healthy: true });
    const result = await startBot(deps);

    expect(result).toBeTruthy();
    // Success log mentions the VOICEVOX connection.
    const logged = deps.logger.log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/VOICEVOX/i);

    // Listeners registered.
    expect(result.client.handlers['messageCreate']).toBeTypeOf('function');
    expect(result.client.handlers['voiceStateUpdate']).toBeTypeOf('function');
    // Logged in with the token.
    expect(result.client.loggedInWith).toBe('tok');
    // Required intents present.
    expect(result.client.options.intents).toEqual([1, 2, 4, 8]);
  });

  it('logs the "start VOICEVOX" instruction on a failed health check but still logs in (Req 9.3)', async () => {
    const deps = makeDeps({ healthy: false });
    const result = await startBot(deps);

    const errored = deps.logger.error.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errored).toMatch(/VOICEVOX/i);
    // Non-fatal: still logs in.
    expect(result.client.loggedInWith).toBe('tok');
  });
});
