// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { createMessageListener } from '../src/events/messageListener.js';
import { createVoiceStateListener } from '../src/events/voiceStateListener.js';

function makeSession(overrides = {}) {
  return {
    guildId: 'g1',
    voiceChannelId: 'vc1',
    linkedTextChannelId: 'tc1',
    speakerId: 3,
    queue: { items: [], enqueue(i) { this.items.push(i); return true; }, size() { return this.items.length; } },
    controller: { notify: vi.fn(), skip: vi.fn(), stopAll: vi.fn() },
    ...overrides,
  };
}

describe('messageListener', () => {
  function setup(session) {
    const sessionManager = { get: vi.fn(() => session) };
    const commandHandler = { handle: vi.fn(async () => {}) };
    const client = { user: { id: 'bot' } };
    const listener = createMessageListener({
      client,
      config: { commandPrefix: '!' },
      sessionManager,
      commandHandler,
    });
    return { listener, sessionManager, commandHandler };
  }

  function plainMessage(overrides = {}) {
    return {
      guild: { id: 'g1', voiceAdapterCreator: () => ({}) },
      author: { id: 'u1', bot: false },
      member: { voice: { channelId: 'vc1' } },
      content: 'hello world',
      channelId: 'tc1',
      channel: { send: vi.fn(async () => {}) },
      mentions: {},
      ...overrides,
    };
  }

  it('enqueues an accepted plain message and notifies the controller (Req 3.1)', async () => {
    const session = makeSession();
    const { listener } = setup(session);
    await listener(plainMessage());
    expect(session.queue.size()).toBe(1);
    expect(session.queue.items[0].rawContent).toBe('hello world');
    expect(session.controller.notify).toHaveBeenCalled();
  });

  it('does NOT enqueue a message from a different channel (shouldRead fails)', async () => {
    const session = makeSession();
    const { listener } = setup(session);
    await listener(plainMessage({ channelId: 'other' }));
    expect(session.queue.size()).toBe(0);
    expect(session.controller.notify).not.toHaveBeenCalled();
  });

  it('ignores messages from bot authors (Req 3.4)', async () => {
    const session = makeSession();
    const { listener, commandHandler } = setup(session);
    await listener(plainMessage({ author: { id: 'x', bot: true } }));
    expect(session.queue.size()).toBe(0);
    expect(commandHandler.handle).not.toHaveBeenCalled();
  });

  it('routes prefixed messages to the command handler (Req 10.1)', async () => {
    const session = makeSession();
    const { listener, commandHandler } = setup(session);
    await listener(plainMessage({ content: '!join' }));
    expect(commandHandler.handle).toHaveBeenCalledTimes(1);
    const [parsed] = commandHandler.handle.mock.calls[0];
    expect(parsed.name).toBe('join');
    // Not enqueued for reading.
    expect(session.queue.size()).toBe(0);
  });

  it('does nothing on a plain message when there is no session', async () => {
    const { listener } = setup(undefined);
    const msg = plainMessage();
    await expect(listener(msg)).resolves.toBeUndefined();
  });
});

describe('voiceStateListener', () => {
  function guildWithChannel(members) {
    return {
      id: 'g1',
      channels: {
        cache: new Map([['vc1', { members }]]),
      },
    };
  }

  it('ends the session when only bots remain (Req 2.5, 2.6)', async () => {
    const session = makeSession();
    const end = vi.fn(async () => true);
    const sessionManager = { get: vi.fn(() => session), end };
    const listener = createVoiceStateListener({ sessionManager });

    // Only the bot remains in the channel.
    const members = new Map([['bot', { user: { bot: true } }]]);
    const guild = guildWithChannel(members);
    await listener({ guild }, { guild });

    expect(end).toHaveBeenCalledWith('g1', 'empty-channel');
  });

  it('does NOT end the session while a human remains', async () => {
    const session = makeSession();
    const end = vi.fn(async () => true);
    const sessionManager = { get: vi.fn(() => session), end };
    const listener = createVoiceStateListener({ sessionManager });

    const members = new Map([
      ['bot', { user: { bot: true } }],
      ['u1', { user: { bot: false } }],
    ]);
    const guild = guildWithChannel(members);
    await listener({ guild }, { guild });

    expect(end).not.toHaveBeenCalled();
  });

  it('ignores updates when there is no session', async () => {
    const sessionManager = { get: vi.fn(() => undefined), end: vi.fn() };
    const listener = createVoiceStateListener({ sessionManager });
    const guild = guildWithChannel(new Map());
    await listener({ guild }, { guild });
    expect(sessionManager.end).not.toHaveBeenCalled();
  });
});
