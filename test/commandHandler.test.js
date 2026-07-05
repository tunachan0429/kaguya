// @ts-check
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { CommandHandler } from '../src/commands/commandHandler.js';
import {
  JOIN_CONFIRM,
  NOT_IN_VOICE,
  NO_ACTIVE_SESSION,
  QUEUE_CLEARED,
} from '../src/text/messages.js';

const NUM_RUNS = 100;

/** Build a session-manager fake around an optional pre-seeded session. */
function makeSessions(session) {
  return {
    _session: session,
    getOrCreate: vi.fn(function (_g, params) {
      this._session = {
        guildId: _g,
        speakerId: 3,
        linkedTextChannelId: params.linkedTextChannelId,
        voiceChannelId: params.voiceChannelId,
        send: params.send,
        queue: { clear: vi.fn() },
        controller: { skip: vi.fn(), stopAll: vi.fn() },
      };
      return this._session;
    }),
    get: vi.fn(function () {
      return this._session;
    }),
    end: vi.fn(async () => Boolean(session)),
  };
}

function makeHandler({ sessions, voicevox } = {}) {
  return new CommandHandler({
    sessionManager: sessions || makeSessions(),
    voicevoxClient:
      voicevox || {
        isValidSpeaker: vi.fn(async () => false),
        listSpeakers: vi.fn(async () => []),
      },
    config: { commandPrefix: '!', defaultSpeaker: 3 },
  });
}

function makeCtx(overrides = {}) {
  const sent = [];
  return {
    sent,
    ctx: {
      guildId: 'g1',
      voiceChannelId: 'vc1',
      textChannelId: 'tc1',
      adapterCreator: () => ({}),
      send: async (m) => {
        sent.push(m);
      },
      args: [],
      ...overrides,
    },
  };
}

describe('CommandHandler', () => {
  // Feature: discord-tts-bot, Property 10: Invalid speaker selection retains previous voice
  // For any speaker id VOICEVOX does not provide, and regardless of whether the
  // notification posts successfully, the session's Speaker_ID stays equal to its
  // pre-command value.
  // Validates: Requirements 5.4
  it('Property 10: invalid speaker retains the previous voice regardless of post outcome', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -50, max: 9999 }),
        fc.integer({ min: 0, max: 50 }),
        fc.boolean(),
        async (invalidId, prevSpeaker, postThrows) => {
          const session = {
            guildId: 'g1',
            speakerId: prevSpeaker,
            queue: { clear: vi.fn() },
            controller: { skip: vi.fn() },
          };
          const sessions = makeSessions(session);
          const voicevox = {
            // Every requested id is invalid for this property.
            isValidSpeaker: vi.fn(async () => false),
            listSpeakers: vi.fn(async () => [
              { name: 'A', styleId: 1, styleName: 'n' },
            ]),
          };
          const handler = makeHandler({ sessions, voicevox });
          const send = postThrows
            ? async () => {
                throw new Error('post failed');
              }
            : async () => {};
          const ctx = {
            guildId: 'g1',
            voiceChannelId: 'vc1',
            textChannelId: 'tc1',
            adapterCreator: () => ({}),
            send,
            args: [String(invalidId)],
          };
          await handler.voice(ctx);
          // Speaker unchanged (Req 5.4).
          expect(session.speakerId).toBe(prevSpeaker);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('join instructs the user when not in a voice channel (Req 1.4)', async () => {
    const handler = makeHandler();
    const { ctx, sent } = makeCtx({ voiceChannelId: null });
    await handler.join(ctx);
    expect(sent).toContain(NOT_IN_VOICE);
  });

  it('join starts a session and posts confirmation (Req 1.2, 1.3)', async () => {
    const sessions = makeSessions();
    const handler = makeHandler({ sessions });
    const { ctx, sent } = makeCtx();
    await handler.join(ctx);
    expect(sessions.getOrCreate).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ voiceChannelId: 'vc1', linkedTextChannelId: 'tc1' })
    );
    expect(sent).toContain(JOIN_CONFIRM);
  });

  it('leave with no active session posts the no-session message (Req 2.4)', async () => {
    const sessions = makeSessions(); // end() resolves false
    const handler = makeHandler({ sessions });
    const { ctx, sent } = makeCtx();
    await handler.leave(ctx);
    expect(sessions.end).toHaveBeenCalledWith('g1', 'command');
    expect(sent).toContain(NO_ACTIVE_SESSION);
  });

  it('voice updates the session speaker for a valid id (Req 5.3)', async () => {
    const session = { guildId: 'g1', speakerId: 3, queue: {}, controller: {} };
    const sessions = makeSessions(session);
    const voicevox = {
      isValidSpeaker: vi.fn(async (id) => id === 8),
      listSpeakers: vi.fn(async () => []),
    };
    const handler = makeHandler({ sessions, voicevox });
    const { ctx } = makeCtx({ args: ['8'] });
    await handler.voice(ctx);
    expect(session.speakerId).toBe(8);
  });

  it('voices posts the speaker catalogue (Req 5.5)', async () => {
    const voicevox = {
      isValidSpeaker: vi.fn(async () => false),
      listSpeakers: vi.fn(async () => [
        { name: 'ずんだもん', styleId: 3, styleName: 'ノーマル' },
      ]),
    };
    const handler = makeHandler({ voicevox });
    const { ctx, sent } = makeCtx();
    await handler.voices(ctx);
    expect(sent[0]).toContain('ずんだもん');
    expect(sent[0]).toContain('3');
  });

  it('clear empties the queue and confirms (Req 10.5)', async () => {
    const session = { guildId: 'g1', speakerId: 3, queue: { clear: vi.fn() }, controller: {} };
    const sessions = makeSessions(session);
    const handler = makeHandler({ sessions });
    const { ctx, sent } = makeCtx();
    await handler.clear(ctx);
    expect(session.queue.clear).toHaveBeenCalled();
    expect(sent).toContain(QUEUE_CLEARED);
  });

  it('skip delegates to the controller (Req 4.4/10.4)', async () => {
    const session = { guildId: 'g1', speakerId: 3, queue: {}, controller: { skip: vi.fn() } };
    const sessions = makeSessions(session);
    const handler = makeHandler({ sessions });
    const { ctx } = makeCtx();
    await handler.skip(ctx);
    expect(session.controller.skip).toHaveBeenCalled();
  });

  it('help lists supported commands (Req 10.2)', async () => {
    const handler = makeHandler();
    const { ctx, sent } = makeCtx();
    await handler.help(ctx);
    expect(sent[0]).toContain('!join');
    expect(sent[0]).toContain('!leave');
    expect(sent[0]).toContain('!help');
  });

  it('handle posts unrecognized-command referencing help for a null command (Req 10.3)', async () => {
    const handler = makeHandler();
    const { ctx, sent } = makeCtx();
    await handler.handle({ name: null, args: [] }, ctx);
    expect(sent[0]).toContain('help');
  });

  it('handle dispatches recognized commands', async () => {
    const sessions = makeSessions();
    const handler = makeHandler({ sessions });
    const { ctx, sent } = makeCtx();
    await handler.handle({ name: 'join', args: [] }, ctx);
    expect(sent).toContain(JOIN_CONFIRM);
  });
});
