// @ts-check
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PlaybackQueue } from '../src/playback/playbackQueue.js';

const NUM_RUNS = 100;

describe('PlaybackQueue', () => {
  // Feature: discord-tts-bot, Property 2: FIFO queue ordering with capacity
  // For any sequence of items enqueued (accepting up to the maximum size and
  // dropping the rest), dequeuing repeatedly returns the accepted items in their
  // enqueue order, and the queue size never exceeds the maximum.
  // Validates: Requirements 3.1, 4.1, 4.2
  it('Property 2: preserves FIFO order and never exceeds capacity', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ rawContent: fc.string() }), { maxLength: 50 }),
        fc.integer({ min: 1, max: 30 }),
        (items, maxSize) => {
          const queue = new PlaybackQueue(maxSize);
          const accepted = [];
          for (const item of items) {
            const ok = queue.enqueue(item);
            // Size must never exceed the maximum at any point.
            expect(queue.size()).toBeLessThanOrEqual(maxSize);
            if (ok) {
              accepted.push(item);
            }
          }
          // The number of accepted items equals min(total, maxSize).
          expect(accepted.length).toBe(Math.min(items.length, maxSize));

          // Dequeuing returns the accepted items in exactly enqueue order.
          const drained = [];
          let next;
          while ((next = queue.dequeue()) !== undefined) {
            drained.push(next);
          }
          expect(drained).toEqual(accepted);
          expect(queue.size()).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // Task 5.3: clear behavior (Req 10.5)
  it('clear empties the queue and size returns 0', () => {
    const queue = new PlaybackQueue(10);
    queue.enqueue({ rawContent: 'a' });
    queue.enqueue({ rawContent: 'b' });
    expect(queue.size()).toBe(2);
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.peek()).toBeUndefined();
    expect(queue.dequeue()).toBeUndefined();
  });

  it('enqueue returns false and drops items when at capacity', () => {
    const queue = new PlaybackQueue(2);
    expect(queue.enqueue({ rawContent: 'a' })).toBe(true);
    expect(queue.enqueue({ rawContent: 'b' })).toBe(true);
    expect(queue.enqueue({ rawContent: 'c' })).toBe(false);
    expect(queue.size()).toBe(2);
    expect(queue.dequeue()).toEqual({ rawContent: 'a' });
    expect(queue.dequeue()).toEqual({ rawContent: 'b' });
  });

  it('peek returns the oldest item without removing it', () => {
    const queue = new PlaybackQueue(5);
    queue.enqueue({ rawContent: 'first' });
    queue.enqueue({ rawContent: 'second' });
    expect(queue.peek()).toEqual({ rawContent: 'first' });
    expect(queue.size()).toBe(2);
  });
});
