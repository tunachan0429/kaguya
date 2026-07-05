// @ts-check

/**
 * @file VOICEVOX Engine HTTP client (Requirements 5, 9).
 *
 * Wraps all interaction with a locally running VOICEVOX Engine: a startup
 * health check, speaker discovery, speaker validation, and the two-step
 * synthesis flow (`/audio_query` then `/synthesis`). Uses the native `fetch`
 * available in Node 18+; a custom fetch implementation may be injected for
 * testing.
 */

import { Readable } from 'node:stream';

/**
 * @typedef {Object} Speaker
 * @property {string} name      Character name.
 * @property {number} styleId   Numeric style id (== Speaker_ID).
 * @property {string} styleName Style name (e.g. "ノーマル").
 */

const DEFAULT_URL = 'http://127.0.0.1:50021';

export class VoicevoxClient {
  /**
   * @param {string} [baseUrl] VOICEVOX Engine base URL.
   * @param {{ fetchImpl?: typeof fetch }} [options]
   */
  constructor(baseUrl = DEFAULT_URL, options = {}) {
    /** @private */
    this._baseUrl = String(baseUrl || DEFAULT_URL).replace(/\/+$/, '');
    /** @private */
    this._fetch = options.fetchImpl || globalThis.fetch;
    if (typeof this._fetch !== 'function') {
      throw new Error('No fetch implementation available (Node 18+ required).');
    }
  }

  /** @returns {string} The normalized base URL. */
  get baseUrl() {
    return this._baseUrl;
  }

  /**
   * Health check against `GET /version` (Req 9.1).
   *
   * @returns {Promise<boolean>} `true` when the engine responds with a 2xx status.
   */
  async healthCheck() {
    try {
      const res = await this._fetch(`${this._baseUrl}/version`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve the catalogue of speakers, flattened to one entry per style
   * (`GET /speakers`, Req 5.5).
   *
   * @returns {Promise<Speaker[]>}
   */
  async listSpeakers() {
    const res = await this._fetch(`${this._baseUrl}/speakers`, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`VOICEVOX /speakers failed with status ${res.status}`);
    }
    const data = await res.json();
    /** @type {Speaker[]} */
    const speakers = [];
    for (const character of Array.isArray(data) ? data : []) {
      const styles = Array.isArray(character?.styles) ? character.styles : [];
      for (const style of styles) {
        speakers.push({
          name: character.name,
          styleId: style.id,
          styleName: style.name,
        });
      }
    }
    return speakers;
  }

  /**
   * Determine whether the given Speaker_ID is provided by the engine (Req 5.4).
   *
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async isValidSpeaker(id) {
    const speakers = await this.listSpeakers();
    return speakers.some((s) => s.styleId === id);
  }

  /**
   * Two-step synthesis: `POST /audio_query` to obtain the query object, then
   * `POST /synthesis` with that query to obtain WAV bytes (Req 3.2). Rejects on
   * any non-2xx response or network failure (feeds Req 9.4).
   *
   * @param {string} text     Spoken text.
   * @param {number} speakerId Speaker_ID.
   * @returns {Promise<Readable>} A Node readable stream of WAV audio bytes.
   */
  async synthesize(text, speakerId) {
    const queryUrl = `${this._baseUrl}/audio_query?text=${encodeURIComponent(
      text
    )}&speaker=${encodeURIComponent(String(speakerId))}`;
    const queryRes = await this._fetch(queryUrl, { method: 'POST' });
    if (!queryRes.ok) {
      throw new Error(`VOICEVOX /audio_query failed with status ${queryRes.status}`);
    }
    const audioQuery = await queryRes.json();

    const synthUrl = `${this._baseUrl}/synthesis?speaker=${encodeURIComponent(
      String(speakerId)
    )}`;
    const synthRes = await this._fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(audioQuery),
    });
    if (!synthRes.ok) {
      throw new Error(`VOICEVOX /synthesis failed with status ${synthRes.status}`);
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    return Readable.from(Buffer.from(arrayBuffer));
  }
}
