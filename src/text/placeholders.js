// @ts-check

/**
 * @file Fixed spoken-text placeholder constants used by {@link module:text/preprocess}.
 *
 * These are intentionally short, plain Japanese words so that:
 *  - they read naturally aloud, and
 *  - they never themselves match a URL, mention, custom-emoji, or code-block
 *    pattern (which keeps preprocessing idempotent — Req 7.3 / Property 9).
 */

/** Spoken replacement for a URL (Req 6.1). */
export const URL_PLACEHOLDER = 'リンク';

/** Spoken replacement for a fenced code block (Req 6.4). */
export const CODE_BLOCK_PLACEHOLDER = 'コード';

/** Spoken suffix appended when text is truncated to the reading limit (Req 6.5). */
export const OMISSION_PLACEHOLDER = '以下略';
