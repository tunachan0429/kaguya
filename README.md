# Kaguya — Discord TTS (read-aloud) bot

Kaguya is a Discord text-to-speech bot. It joins a voice channel and reads aloud,
in a free cute-sounding Japanese voice, the messages posted in a linked text
channel. Speech is synthesized locally by the free
[VOICEVOX Engine](https://voicevox.hiroshiba.jp/) (Zundamon, Shikoku Metan, and
other selectable character voices), so there is no per-use cost or cloud API key.

## Features

- Join / leave a voice channel on command, with automatic disconnect when the
  channel empties of humans.
- Reads new text-channel messages aloud in first-in-first-out order.
- Sensible handling of hard-to-read content: URLs, mentions, custom emojis, and
  fenced code blocks are replaced with short spoken placeholders, and long
  messages are truncated to a configurable limit.
- Selectable voice (VOICEVOX Speaker ID) with a listing command.
- `skip` and `clear` playback controls.
- Simple `.env` configuration and a double-click Windows launcher.

## Prerequisites

- **Node.js 18 or newer** (`node --version` to check). Node 18+ is required for
  the built-in `fetch` used to talk to VOICEVOX.
- **VOICEVOX Engine** — download and run it from
  <https://voicevox.hiroshiba.jp/>. By default it listens on
  `http://127.0.0.1:50021`.
- A **Discord bot application and token** from the
  [Discord Developer Portal](https://discord.com/developers/applications). The
  bot must be invited to your server and have these Gateway intents enabled:
  **Guilds**, **Guild Voice States**, **Guild Messages**, and **Message
  Content** (Message Content is a privileged intent — enable it in the portal).

## Installation

```bash
git clone <this-repo>
cd kaguya
npm install
```

On Windows you can skip the manual `npm install`: the `start.bat` launcher runs
it automatically on the first run.

## Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | **Yes** | — | Your Discord bot token. If absent, the bot logs an error and exits. |
| `VOICEVOX_URL` | No | `http://127.0.0.1:50021` | Base URL of your running VOICEVOX Engine. |
| `DEFAULT_SPEAKER` | No | `3` | Default VOICEVOX Speaker ID (3 = Zundamon, Normal). |
| `COMMAND_PREFIX` | No | `!` | Character sequence that marks a message as a command. |
| `READING_LIMIT` | No | `100` | Maximum number of spoken characters per message. |

Any optional value that is omitted falls back to the documented default.

## Running

First make sure the VOICEVOX Engine is running (see Prerequisites).

### Windows

Double-click **`start.bat`**. It will:

1. Check that Node.js is on your PATH (and warn you if it is not).
2. Install dependencies automatically if `node_modules` is missing.
3. Start the bot.
4. Keep the console window open and show the exit status if the bot stops with
   an error.

### macOS / Linux (or any platform)

```bash
npm start
```

On startup the console prints whether it connected to the VOICEVOX Engine. If it
reports that VOICEVOX cannot be reached, start VOICEVOX and post a message again
— the bot does not need to be restarted.

## Commands

All commands must begin with your `COMMAND_PREFIX` (default `!`).

| Command | Description |
| --- | --- |
| `!join` | Join the voice channel you are in and read this text channel aloud. |
| `!leave` | Leave the voice channel and end the read-aloud session. |
| `!skip` | Stop the current message and move on to the next queued one. |
| `!clear` | Remove all pending messages from the queue. |
| `!voice <ID>` | Change the voice used for reading to the given Speaker ID. |
| `!voices` | List the available character names and their Speaker IDs. |
| `!help` | Show the list of supported commands. |

## Running the tests

The project uses [Vitest](https://vitest.dev/) with
[fast-check](https://fast-check.dev/) for property-based tests:

```bash
npm test
```

The suite covers the pure logic (text preprocessing, message filtering, FIFO
queue ordering, command parsing, and configuration defaulting) as well as the
session, playback, command, listener, and startup wiring. Each test reports an
individual pass/fail result.

## End-to-end verification

For a full manual walkthrough that confirms real audio playback, follow
[`VERIFICATION.md`](./VERIFICATION.md).

## Project structure

```
src/
  config/     configuration loading (.env -> Config)
  text/       pure text preprocessing, placeholders, and message strings
  discord/    message filter + voice-transport wrapper
  voicevox/   VOICEVOX HTTP client (health check, speakers, synthesis)
  playback/   FIFO queue + audio playback controller
  session/    per-guild session models + session manager
  commands/   command parser + command handler
  events/     messageCreate and voiceStateUpdate listeners
  index.js    startup sequence and wiring
test/         Vitest unit / property / integration tests
start.bat     Windows launcher
```

## Troubleshooting

- **"Could not reach VOICEVOX Engine"** — start the VOICEVOX Engine and confirm
  `http://127.0.0.1:50021/version` responds; adjust `VOICEVOX_URL` if you run it
  on a different host or port.
- **The bot logs in but does not read messages** — ensure the **Message
  Content** intent is enabled in the Developer Portal, and that you issued
  `!join` from the text channel you want read aloud.
- **The bot exits immediately** — check that `DISCORD_TOKEN` is set in `.env`.

## License

MIT
