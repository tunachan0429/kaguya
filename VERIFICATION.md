# Manual Verification Procedure

This document describes how to confirm, end to end, that the Discord TTS
(read-aloud) bot actually works — from starting the VOICEVOX Engine through
hearing synthesized audio in a Discord voice channel. It satisfies Requirement
12.3.

Run through these steps after installing and configuring the bot (see
[`README.md`](./README.md)).

## Prerequisites

- Node.js 18 or newer installed.
- The [VOICEVOX Engine](https://voicevox.hiroshiba.jp/) downloaded and runnable.
- A Discord bot application with a token, invited to your server with the
  **Guilds**, **Guild Voice States**, **Guild Messages**, and **Message
  Content** intents enabled.
- A `.env` file created from `.env.example` with at least `DISCORD_TOKEN` set.

## Step 1 — Start the VOICEVOX Engine

1. Launch the VOICEVOX Engine (the desktop app or the standalone engine).
2. Confirm it is reachable by opening `http://127.0.0.1:50021/version` in a
   browser (or run `curl http://127.0.0.1:50021/version`). You should see a
   version string. If not, the bot will report that it cannot reach VOICEVOX.

## Step 2 — Configure the bot

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_TOKEN` to your bot token.
3. Optionally adjust `VOICEVOX_URL`, `DEFAULT_SPEAKER`, `COMMAND_PREFIX`, and
   `READING_LIMIT`. Omitted values fall back to their documented defaults.

## Step 3 — Launch the bot

- **Windows:** double-click `start.bat`. On the first run it installs
  dependencies automatically, then starts the bot.
- **macOS / Linux (or any platform):** run `npm install` once, then `npm start`.

## Step 4 — Confirm the VOICEVOX connection log

- Watch the console output at startup.
- **Expected:** a success line similar to
  `[voicevox] Connected to VOICEVOX Engine at http://127.0.0.1:50021.`
- If instead you see an instruction to start VOICEVOX Engine, return to Step 1.

## Step 5 — Join a voice channel

1. In Discord, join any voice channel in your server.
2. In a text channel, post `!join` (use your `COMMAND_PREFIX` if you changed it).
3. **Expected:** the bot joins your voice channel and posts a confirmation
   message in that text channel. That text channel is now the linked channel.

## Step 6 — Confirm basic playback

1. Post a plain message such as `こんにちは` (or any text) in the linked channel.
2. **Expected:** you hear the message read aloud in the voice channel.

## Step 7 — Confirm preprocessing of hard-to-read content

Post each of the following (individually) and confirm the spoken output is
sensible and short:

1. A URL, e.g. `見て https://example.com/page` — the URL is spoken as a fixed
   placeholder, not read character by character.
2. A mention, e.g. `@yourname` — spoken as the display name.
3. A custom server emoji, e.g. `:your_emoji:` — spoken as the emoji name.
4. A fenced code block:
   ````
   ```js
   console.log("hi")
   ```
   ````
   — spoken as a fixed code placeholder.
5. A very long message (longer than `READING_LIMIT`) — spoken text is truncated
   and ends with the omission marker.

## Step 8 — Confirm ordering, skip, and clear

1. Post several messages quickly in a row.
   **Expected:** they are read in the order they were sent (FIFO), one after
   another without interrupting each other.
2. While a message is being read, post `!skip`.
   **Expected:** the current message stops and the next queued message begins.
3. Queue several messages, then post `!clear`.
   **Expected:** the pending queue is emptied and the bot confirms.

## Step 9 — Confirm voice selection (optional)

1. Post `!voices` and confirm the bot lists character names and their IDs.
2. Post `!voice <ID>` with a valid ID and confirm subsequent messages use the
   new voice.
3. Post `!voice 999999` (an invalid ID) and confirm the voice does **not**
   change and the bot posts the available IDs.

## Step 10 — Leave the voice channel

1. Post `!leave`.
   **Expected:** the bot disconnects and posts a confirmation; the queue is
   cleared.
2. As an alternative, have every human leave the voice channel while the bot is
   connected.
   **Expected:** the bot automatically disconnects and posts a session-end
   confirmation.

## Automated tests

Run the automated suite to confirm the pure logic (preprocessing, queue
ordering, filtering, command parsing, config defaulting) and the wiring:

```
npm test
```

Each test reports an individual pass/fail result (Requirement 12.4).
