// @ts-check

/**
 * @file In-memory FIFO playback queue with a maximum size (Requirements 3, 4, 10.5).
 *
 * Pure data structure with no I/O so its ordering behavior is unit- and
 * property-testable.
 */

/**
 * @typedef {Object} QueueItem
 * @property {string} rawContent       Original message text.
 * @property {import('../text/preprocess.js').MentionTable} [mentions] Resolved mentions.
 * @property {number} [enqueuedAt]     Timestamp for ordering / diagnostics.
 */

const DEFAULT_MAX_SIZE = 100;

export class PlaybackQueue {
  /**
   * @param {number} [maxSize] Maximum number of items retained. Defaults to 100.
   */
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    const parsed = Number.isFinite(maxSize) ? Math.trunc(maxSize) : DEFAULT_MAX_SIZE;
    /** @private */
    this._maxSize = parsed > 0 ? parsed : DEFAULT_MAX_SIZE;
    /** @private @type {QueueItem[]} */
    this._items = [];
  }

  /** @returns {number} The configured maximum size. */
  get maxSize() {
    return this._maxSize;
  }

  /**
   * Append an item to the tail of the queue.
   *
   * @param {QueueItem} item
   * @returns {boolean} `true` if accepted; `false` if the queue is at capacity
   *   (in which case the item is dropped, Req 4.2 back-pressure).
   */
  enqueue(item) {
    if (this._items.length >= this._maxSize) {
      return false;
    }
    this._items.push(item);
    return true;
  }

  /**
   * Remove and return the oldest item (FIFO, Req 4.1).
   *
   * @returns {QueueItem | undefined}
   */
  dequeue() {
    return this._items.shift();
  }

  /**
   * Look at the oldest item without removing it.
   *
   * @returns {QueueItem | undefined}
   */
  peek() {
    return this._items[0];
  }

  /** Remove every item from the queue (Req 10.5, 2.2). */
  clear() {
    this._items = [];
  }

  /** @returns {number} The current number of queued items. */
  size() {
    return this._items.length;
  }
}
