// @ts-check
import { describe, it, expect, vi } from 'vitest';
import { VoicevoxClient } from '../src/voicevox/voicevoxClient.js';

/**
 * Build a minimal fetch-like Response.
 * @param {{ ok?: boolean, status?: number, json?: any, arrayBuffer?: ArrayBuffer }} opts
 */
function makeResponse(opts) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.json,
    arrayBuffer: async () => opts.arrayBuffer ?? new ArrayBuffer(0),
  };
}

describe('VoicevoxClient', () => {
  // Task 7.3: health check messaging (Req 9.1, 9.2, 9.3)
  describe('healthCheck', () => {
    it('returns true when /version responds ok (drives the success message, Req 9.1/9.2)', async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ ok: true, status: 200 }));
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.healthCheck()).resolves.toBe(true);
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://127.0.0.1:50021/version',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns false when /version responds non-ok (drives the "start VOICEVOX" message, Req 9.3)', async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 503 }));
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.healthCheck()).resolves.toBe(false);
    });

    it('returns false when the request throws (engine not running, Req 9.3)', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.healthCheck()).resolves.toBe(false);
    });
  });

  describe('listSpeakers / isValidSpeaker', () => {
    const speakersPayload = [
      { name: 'ずんだもん', styles: [{ id: 3, name: 'ノーマル' }, { id: 1, name: 'あまあま' }] },
      { name: '四国めたん', styles: [{ id: 2, name: 'ノーマル' }] },
    ];

    it('flattens the /speakers catalogue (Req 5.5)', async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ ok: true, json: speakersPayload }));
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      const speakers = await client.listSpeakers();
      expect(speakers).toEqual([
        { name: 'ずんだもん', styleId: 3, styleName: 'ノーマル' },
        { name: 'ずんだもん', styleId: 1, styleName: 'あまあま' },
        { name: '四国めたん', styleId: 2, styleName: 'ノーマル' },
      ]);
    });

    it('validates speaker ids from the catalogue (Req 5.4)', async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ ok: true, json: speakersPayload }));
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.isValidSpeaker(3)).resolves.toBe(true);
      await expect(client.isValidSpeaker(999)).resolves.toBe(false);
    });
  });

  // Task 7.4: synthesis sequence (Req 3.2)
  describe('synthesize', () => {
    it('calls /audio_query then /synthesis in order and returns a WAV stream', async () => {
      const calls = [];
      const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"
      const fetchImpl = vi.fn(async (url, init) => {
        calls.push({ url, method: init?.method });
        if (String(url).includes('/audio_query')) {
          return makeResponse({ ok: true, json: { accent_phrases: [], speedScale: 1 } });
        }
        if (String(url).includes('/synthesis')) {
          return makeResponse({ ok: true, arrayBuffer: wavBytes.buffer });
        }
        throw new Error(`unexpected url ${url}`);
      });

      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      const stream = await client.synthesize('こんにちは', 3);

      // Sequence: audio_query first, synthesis second.
      expect(calls).toHaveLength(2);
      expect(String(calls[0].url)).toContain('/audio_query');
      expect(String(calls[0].url)).toContain('speaker=3');
      expect(String(calls[0].url)).toContain('text=');
      expect(String(calls[1].url)).toContain('/synthesis');
      expect(String(calls[1].url)).toContain('speaker=3');

      // Returns a readable stream carrying the WAV bytes.
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const received = Buffer.concat(chunks);
      expect(Array.from(received)).toEqual(Array.from(wavBytes));
    });

    it('rejects when /audio_query returns a non-2xx status (Req 9.4)', async () => {
      const fetchImpl = vi.fn(async () => makeResponse({ ok: false, status: 500 }));
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.synthesize('x', 3)).rejects.toThrow(/audio_query/);
    });

    it('rejects when /synthesis returns a non-2xx status (Req 9.4)', async () => {
      const fetchImpl = vi.fn(async (url) => {
        if (String(url).includes('/audio_query')) {
          return makeResponse({ ok: true, json: {} });
        }
        return makeResponse({ ok: false, status: 500 });
      });
      const client = new VoicevoxClient('http://127.0.0.1:50021', { fetchImpl });
      await expect(client.synthesize('x', 3)).rejects.toThrow(/synthesis/);
    });
  });
});
