// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../src/session/sessionManager.js';
import { buildMentionTable } from '../src/session/models.js';
import { LEAVE_CONFIRM, EMPTY_CHANNEL_LEAVE } from '../src/text/messages.js';

/**
 * Build a SessionManager with lightweight fakes for the voice service and the
 * controller factory.
 */
function makeManager(config = { defaultSpeaker: 3, readingLimit: 100 }) {
  const connections = [];
  const voiceService = {
    join: vi.fn((opts) => {
      const connection = { id: `conn-${connections.length}`, opts, destroyed: false };
      connections.push(connection);
      return { connection, player: { id: 'player' } };
    }),
    leave: vi.fn((connection) => {
      if (connection) connection.destroyed = true;
    }),
  };
  const createdControllers = [];
  const createController = vi.fn((session) => {
    const controller = { session, stopAll: vi.fn() };
    createdControllers.push(controller);
    return controller;
  });
  const manager = new SessionManager({ config, voiceService, createController });
  return { manager, voiceService, createController, connections, createdControllers };
}

describe('SessionManager', () => {
  it('create-on-join sets the linked channel and default speaker (Req 1.2, 5.2)', () => {
    const { manager, voiceService } = makeManager();
    const send = vi.fn(async () => {});
    const session = manager.getOrCreate('g1', {
      voiceChannelId: 'vc1',
      linkedTextChannelId: 'tc1',
      send,
      joinOptions: { channelId: 'vc1' },
    });

    expect(session.linkedTextChannelId).toBe('tc1');
    expect(session.voiceChannelId).toBe('vc1');
    expect(session.speakerId).toBe(3);
    expect(session.queue.size()).toBe(0);
    expect(session.controller).toBeTruthy();
    expect(voiceService.join).toHaveBeenCalledTimes(1);
    expect(manager.get('g1')).toBe(session);
    expect(manager.has('g1')).toBe(true);
  });

  it('rejoin moves the connection and relinks the text channel (Req 1.5)', () => {
    const { manager, voiceService } = makeManager();
    const send1 = vi.fn(async () => {});
    const send2 = vi.fn(async () => {});
    const first = manager.getOrCreate('g1', {
      voiceChannelId: 'vc1',
      linkedTextChannelId: 'tc1',
      send: send1,
      joinOptions: { channelId: 'vc1' },
    });
    const firstController = first.controller;

    const second = manager.getOrCreate('g1', {
      voiceChannelId: 'vc2',
      linkedTextChannelId: 'tc2',
      send: send2,
      joinOptions: { channelId: 'vc2' },
    });

    // Same session instance, moved + relinked.
    expect(second).toBe(first);
    expect(second.voiceChannelId).toBe('vc2');
    expect(second.linkedTextChannelId).toBe('tc2');
    expect(second.send).toBe(send2);
    // Controller is not recreated on a move.
    expect(second.controller).toBe(firstController);
    expect(voiceService.join).toHaveBeenCalledTimes(2);
  });

  it('end clears the queue, disconnects, and posts the command confirmation (Req 2.1-2.3)', async () => {
    const { manager, voiceService } = makeManager();
    const send = vi.fn(async () => {});
    const session = manager.getOrCreate('g1', {
      voiceChannelId: 'vc1',
      linkedTextChannelId: 'tc1',
      send,
      joinOptions: {},
    });
    session.queue.enqueue({ rawContent: 'a', mentions: { users: {}, roles: {}, channels: {} }, enqueuedAt: 1 });
    session.queue.enqueue({ rawContent: 'b', mentions: { users: {}, roles: {}, channels: {} }, enqueuedAt: 2 });
    expect(session.queue.size()).toBe(2);

    const ended = await manager.end('g1', 'command');

    expect(ended).toBe(true);
    expect(session.queue.size()).toBe(0); // Req 2.2
    expect(session.controller.stopAll).toHaveBeenCalled();
    expect(voiceService.leave).toHaveBeenCalledWith(session.connection);
    expect(send).toHaveBeenCalledWith(LEAVE_CONFIRM); // Req 2.3
    expect(manager.get('g1')).toBeUndefined();
  });

  it('end posts the empty-channel confirmation for the empty-channel reason (Req 2.6)', async () => {
    const { manager } = makeManager();
    const send = vi.fn(async () => {});
    manager.getOrCreate('g1', {
      voiceChannelId: 'vc1',
      linkedTextChannelId: 'tc1',
      send,
      joinOptions: {},
    });

    await manager.end('g1', 'empty-channel');

    expect(send).toHaveBeenCalledWith(EMPTY_CHANNEL_LEAVE); // Req 2.6
  });

  it('end returns false when no session exists (Req 2.4)', async () => {
    const { manager } = makeManager();
    await expect(manager.end('nope', 'command')).resolves.toBe(false);
  });

  it('end swallows a failing confirmation post without throwing', async () => {
    const { manager } = makeManager();
    const send = vi.fn(async () => {
      throw new Error('post failed');
    });
    manager.getOrCreate('g1', {
      voiceChannelId: 'vc1',
      linkedTextChannelId: 'tc1',
      send,
      joinOptions: {},
    });
    await expect(manager.end('g1', 'command')).resolves.toBe(true);
  });
});

describe('buildMentionTable', () => {
  it('resolves user, role, and channel mentions into name maps (Req 6.2, 7.1)', () => {
    const message = {
      mentions: {
        users: new Map([
          ['1', { id: '1', username: 'alice', globalName: 'Alice' }],
          ['2', { id: '2', username: 'bob' }],
        ]),
        members: new Map([['1', { displayName: 'Ali (guild)' }]]),
        roles: new Map([['10', { id: '10', name: 'Admins' }]]),
        channels: new Map([['20', { id: '20', name: 'general' }]]),
      },
    };
    const table = buildMentionTable(message);
    expect(table.users['1']).toBe('Ali (guild)'); // guild member display name preferred
    expect(table.users['2']).toBe('bob');
    expect(table.roles['10']).toBe('Admins');
    expect(table.channels['20']).toBe('general');
  });

  it('returns empty maps for a message with no mentions', () => {
    expect(buildMentionTable({})).toEqual({ users: {}, roles: {}, channels: {} });
    expect(buildMentionTable(null)).toEqual({ users: {}, roles: {}, channels: {} });
  });
});
