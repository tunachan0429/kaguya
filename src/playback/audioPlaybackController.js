// @ts-check

/**
 * @file Audio playback controller: drives synthesis + ordered playback for a
 * single session (Requirements 3, 4, 9).
 *
 * A single "pump" loop pulls the oldest queued item, preprocesses it, discards
 * it when nothing readable remains (Req 6.6), synthesizes audio via the
 * {@link module:voicevox/voicevoxClient VoicevoxClient}, wraps the resulting
 * stream in an audio resource, and plays it. Playback advances to the next item
 * when the underlying `AudioPlayer` transitions to `Idle` (Req 4.3), giving
 * ordered, gap-free FIFO playback (Req 4.1) while new arrivals are appended
 * without interrupting the current item (Req 4.2).
 *
 * The controller is decoupled from `@discordjs/voice`: the audio player lives on
 * the session, and `createAudioResource` plus the Idle status token are injected
 * so the branch behavior is unit-testable with fakes.
 */

import { preprocess } from '../text/preprocess.js';
import { SYNTHESIS_FAILED } from '../text/messages.js';

/**
 * @typedef {import('../session/models.js').Session} Session
 */

export class AudioPlaybackController {
  /**
   * @param {Object} deps
   * @param {Session} deps.session The owning session (provides player, queue, speakerId, send).
   * @param {{ synthesize: (text: string, speakerId: number) => Promise<any> }} deps.voicevoxClient
   * @param {number} deps.readingLimit Maximum spoken characters (from Config).
   * @param {(stream: any) => any} deps.createAudioResource Wraps a stream into an audio resource.
   * @param {string} [deps.idleStatus] The player status value that signals playback completion.
   *   Defaults to `'idle'`; production wiring passes `AudioPlayerStatus.Idle`.
   */
  constructor({ session, voicevoxClient, readingLimit, createAudioResource, idleStatus = 'idle' }) {
    /** @private */
    this._session = session;
    /** @private */
    this._player = session.player;
    /** @private */
    this._queue = session.queue;
    /** @private */
    this._voicevox = voicevoxClient;
    /** @private */
    this._readingLimit = readingLimit;
    /** @private */
    this._createAudioResource = createAudioResource;

    /** @private Whether a pump cycle is in progress (awaiting synthesis or playback). */
    this._pumping = false;
    /** @private Once halted (Req 9.6) the pump refuses to process further items. */
    this._halted = false;
    /** @private Suppresses exactly one Idle advance (used by skip/stopAll). */
    this._suppressNextIdle = false;
    /** @private @type {any} */
    this._current = null;

    if (this._player && typeof this._player.on === 'function') {
      this._player.on(idleStatus, () => this._onIdle());
    }
  }

  /** @returns {boolean} Whether the pump has halted after a failed error-handling step. */
  get halted() {
    return this._halted;
  }

  /**
   * Signal that new items may be available. Starts the pump when idle (Req 4.2:
   * a notify during active playback is a no-op, so the current item is never
   * interrupted).
   */
  notify() {
    if (this._halted || this._pumping) {
      return;
    }
    void this._pump();
  }

  /**
   * Skip the current item and begin the next queued item (Req 4.4 / 10.4).
   * Advances even when `player.stop()` throws. On an empty queue, playback is
   * stopped without starting a new item (Req 4.5).
   */
  skip() {
    if (this._halted) {
      return;
    }
    // The stop() below emits an Idle we must not double-count; suppress it and
    // advance explicitly so we still proceed even if stop() throws.
    this._suppressNextIdle = true;
    try {
      this._player.stop(true);
    } catch {
      // Req 4.4 / 10.4: advance even if stopping fails. Since no Idle will be
      // emitted, clear the suppression so the next real Idle still advances.
      this._suppressNextIdle = false;
    }
    this._current = null;
    this._pumping = false;
    if (this._queue.size() > 0) {
      void this._pump(); // begin the next queued item
    }
    // Empty queue -> stopped without starting a new item (Req 4.5).
  }

  /**
   * Stop all playback (used during session teardown, Req 2.x). Does not advance.
   */
  stopAll() {
    this._suppressNextIdle = true;
    try {
      this._player.stop(true);
    } catch {
      this._suppressNextIdle = false;
    }
    this._current = null;
    this._pumping = false;
  }

  /**
   * The pump loop. Runs until it either starts playing an item (returns while
   * waiting for the Idle event) or exhausts the queue.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _pump() {
    if (this._pumping || this._halted) {
      return;
    }
    this._pumping = true;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this._halted) {
        this._pumping = false;
        return;
      }

      const item = this._queue.dequeue();
      if (!item) {
        this._pumping = false;
        return;
      }

      const spoken = preprocess(item.rawContent, item.mentions, this._readingLimit);
      if (spoken.length === 0) {
        // Nothing readable remains -> discard and try the next item (Req 6.6).
        continue;
      }

      try {
        const stream = await this._voicevox.synthesize(spoken, this._session.speakerId);
        const resource = this._createAudioResource(stream);
        this._current = resource;
        this._player.play(resource);
        // Playing now; advancement happens on the Idle event (Req 4.3).
        return;
      } catch (err) {
        const handled = await this._handleSynthesisFailure(err);
        if (!handled) {
          // A failure-handling step did not complete -> halt the pump (Req 9.6).
          this._halted = true;
          this._pumping = false;
          return;
        }
        // Failure handled -> continue with the remaining items (Req 9.5).
        continue;
      }
    }
  }

  /**
   * Handle a synthesis failure: discard the current item (already dequeued) and
   * post an error to the linked text channel (Req 9.4).
   *
   * @private
   * @param {unknown} _err
   * @returns {Promise<boolean>} `true` when handling completed; `false` when a
   *   step failed (e.g. the error post threw), signalling the pump to halt.
   */
  async _handleSynthesisFailure(_err) {
    try {
      await this._session.send(SYNTHESIS_FAILED);
      return true;
    } catch {
      return false; // Req 9.6
    }
  }

  /**
   * React to the player's Idle transition by advancing to the next item within
   * the required 1 second (Req 4.3). A suppressed Idle (from skip/stopAll) is
   * consumed without advancing.
   *
   * @private
   */
  _onIdle() {
    if (this._suppressNextIdle) {
      this._suppressNextIdle = false;
      return;
    }
    if (!this._pumping) {
      return; // Stray idle while nothing is playing.
    }
    this._current = null;
    this._pumping = false;
    if (this._queue.size() > 0) {
      void this._pump();
    }
  }
}
