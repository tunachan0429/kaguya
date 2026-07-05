// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AudioPlaybackController } from '../src/playback/audioPlaybackController.js';
import { PlaybackQueue } from '../src/playback/playbackQueue.js';
import { SYNTHESIS_FAILED } from '../src/text/messages.js';

/** A fake AudioPlayer that records play/stop and can emit the 'idle' status. */
class FakePlayer extends EventEmitter {
  constructor() {
    super();
    this.played = [];
    this.stopCount = 0;
    this.throwOnStop = false;
  }
  play(resource) {
    this.played.push(resource);
  }
  stop() {
    this.stopCount += 1;
    if (this.throwOnStop) {
      throw new Error('stop failed');
    }
    // Real players transition to Idle on stop.
    this.emit('idle');
  }
  emitIdle() {
    this.emit('idle');
  }
}

/**
 * Build a controller wired to a fake player + real queue.
 * @param {Object} [opts]
 * @param {(text: string, id: number) => Promise<any>} [opts.synthesize]
 * @param {(m: string) => Promise<any>} [opts.send]
 */
function setup(opts = {}) {
  const player = new FakePlayer();
  const queue = new PlaybackQueue(50);
  const sendCalls = [];
  const send =
    opts.send ||
    (async (m) => {
      sendCalls.push(m);
    });
  const session = {
    guildId: 'g1',
    speakerId: 3,
    player,
    queue,
    send,
  };
  const synthesize =
    opts.synthesize || vi.fn(async (text) => ({ text, kind: 'stream' }));
  const createAudioResource = vi.fn((stream) => ({ resource: stream }));
  const controller = new AudioPlaybackController({
    session,
    voicevoxClient: { synthesize },
    readingLimit: 100,
    createAudioResource,
    idleStatus: 'idle',
  });
  session.controller = controller;
  return { controller, player, queue, session, synthesize, createAudioResource, sendCalls };
}

/** Enqueue a plain text item. */
function enqueue(queue, text) {
  queue.enqueue({ rawContent: text, mentions: { users: {}, roles: {}, channels: {} }, enqueuedAt: Date.now() });
}

describe('AudioPlaybackController', () => {
  it('appends new arrivals without interrupting the current item (Req 4.2)', async () => {
    const { controller, player, queue } = setup();
    enqueue(queue, 'first');
    controller.notify();
    await Promise.resolve();
    await Promise.resolve();

    // First item is playing; a new arrival is queued, not played immediately.
    expect(player.played).toHaveLength(1);
    enqueue(queue, 'second');
    controller.notify(); // no-op while playing
    await Promise.resolve();
    expect(player.played).toHaveLength(1);
    expect(queue.size()).toBe(1);
  });

  it('advances to the next item on the Idle transition (Req 4.1, 4.3)', async () => {
    const { controller, player, queue, synthesize } = setup();
    enqueue(queue, 'first');
    enqueue(queue, 'second');
    controller.notify();
    await Promise.resolve();
    await Promise.resolve();
    expect(player.played).toHaveLength(1);

    // Simulate the first item finishing.
    player.emitIdle();
    await Promise.resolve();
    await Promise.resolve();

    expect(player.played).toHaveLength(2);
    // FIFO order preserved.
    expect(synthesize.mock.calls[0][0]).toBe('first');
    expect(synthesize.mock.calls[1][0]).toBe('second');
    // Queue drained.
    expect(queue.size()).toBe(0);
  });

  it('skip advances to the next item even when stop throws (Req 4.4, 10.4)', async () => {
    const { controller, player, queue } = setup();
    enqueue(queue, 'first');
    enqueue(queue, 'second');
    controller.notify();
    await Promise.resolve();
    await Promise.resolve();
    expect(player.played).toHaveLength(1);

    player.throwOnStop = true;
    controller.skip();
    await Promise.resolve();
    await Promise.resolve();

    expect(player.stopCount).toBe(1);
    // Advanced to the next item despite stop() throwing.
    expect(player.played).toHaveLength(2);
  });

  it('skip on an empty queue stops without starting a new item (Req 4.5)', async () => {
    const { controller, player, queue } = setup();
    enqueue(queue, 'only');
    controller.notify();
    await Promise.resolve();
    await Promise.resolve();
    expect(player.played).toHaveLength(1);
    expect(queue.size()).toBe(0);

    controller.skip();
    await Promise.resolve();
    await Promise.resolve();

    expect(player.stopCount).toBe(1);
    // Nothing new started.
    expect(player.played).toHaveLength(1);
  });

  it('discards items that preprocess to nothing readable (Req 6.6)', async () => {
    const { controller, player, queue, synthesize } = setup();
    enqueue(queue, '   '); // whitespace-only -> empty after preprocess
    enqueue(queue, 'real');
    controller.notify();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Only the readable item was synthesized/played.
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize.mock.calls[0][0]).toBe('real');
    expect(player.played).toHaveLength(1);
  });

  it('on synthesis failure discards the item, posts an error, and continues (Req 9.4, 9.5)', async () => {
    let call = 0;
    const synthesize = vi.fn(async (text) => {
      call += 1;
      if (call === 1) {
        throw new Error('synthesis boom');
      }
      return { text };
    });
    const { controller, player, queue, sendCalls } = setup({ synthesize });
    enqueue(queue, 'fails');
    enqueue(queue, 'succeeds');
    controller.notify();
    // allow the async pump to process the failure then the next item
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(sendCalls).toContain(SYNTHESIS_FAILED); // Req 9.4
    // Continued to the next item after the failure (Req 9.5).
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(player.played).toHaveLength(1);
    expect(controller.halted).toBe(false);
  });

  it('halts the pump when failure handling itself fails (Req 9.6)', async () => {
    const synthesize = vi.fn(async () => {
      throw new Error('synthesis boom');
    });
    const send = vi.fn(async () => {
      throw new Error('post failed');
    });
    const { controller, player, queue } = setup({ synthesize, send });
    enqueue(queue, 'fails');
    enqueue(queue, 'never-reached');
    controller.notify();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(controller.halted).toBe(true);
    // The pump stopped: the second item was never synthesized or played.
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(player.played).toHaveLength(0);

    // A subsequent notify is ignored once halted.
    controller.notify();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(synthesize).toHaveBeenCalledTimes(1);
  });
});
