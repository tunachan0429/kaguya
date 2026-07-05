// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { VoiceService } from '../src/discord/voiceService.js';

/**
 * Integration test for VoiceService against a mocked `@discordjs/voice` layer
 * (Req 1.1, 2.1). The injected fakes stand in for `joinVoiceChannel` and
 * `createAudioPlayer`.
 */
describe('VoiceService', () => {
  function makeService() {
    const connection = {
      subscribed: null,
      destroyed: false,
      subscribe(player) {
        this.subscribed = player;
        return { player };
      },
      destroy() {
        this.destroyed = true;
      },
    };
    const player = { id: 'player' };
    const joinVoiceChannel = vi.fn(() => connection);
    const createAudioPlayer = vi.fn(() => player);
    const service = new VoiceService({ joinVoiceChannel, createAudioPlayer });
    return { service, connection, player, joinVoiceChannel, createAudioPlayer };
  }

  it('join creates a connection and player and subscribes them (Req 1.1)', () => {
    const { service, connection, player, joinVoiceChannel, createAudioPlayer } = makeService();
    const result = service.join({
      guildId: 'g1',
      channelId: 'vc1',
      adapterCreator: () => ({}),
    });

    expect(joinVoiceChannel).toHaveBeenCalledTimes(1);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(result.connection).toBe(connection);
    expect(result.player).toBe(player);
    expect(connection.subscribed).toBe(player);
    // Joins self-deafened by default.
    expect(joinVoiceChannel.mock.calls[0][0]).toMatchObject({
      guildId: 'g1',
      channelId: 'vc1',
      selfDeaf: true,
    });
  });

  it('join reuses an existing player on a move (Req 1.5)', () => {
    const { service, createAudioPlayer } = makeService();
    const existingPlayer = { id: 'existing' };
    const result = service.join({
      guildId: 'g1',
      channelId: 'vc2',
      adapterCreator: () => ({}),
      player: existingPlayer,
    });
    expect(result.player).toBe(existingPlayer);
    // No new player created when reusing.
    expect(createAudioPlayer).not.toHaveBeenCalled();
  });

  it('leave destroys the connection (Req 2.1)', () => {
    const { service, connection } = makeService();
    service.leave(connection);
    expect(connection.destroyed).toBe(true);
  });

  it('leave is a no-op for a missing/invalid connection', () => {
    const { service } = makeService();
    expect(() => service.leave(null)).not.toThrow();
    expect(() => service.leave({})).not.toThrow();
  });

  it('constructor rejects missing voice primitives', () => {
    // @ts-expect-error intentional misuse
    expect(() => new VoiceService({})).toThrow();
  });
});
