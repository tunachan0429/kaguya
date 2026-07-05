# Requirements Document

## Introduction

This document defines the requirements for a Discord text-to-speech (read-aloud) bot. The bot joins a Discord voice channel and reads aloud, in a free cute-sounding Japanese voice, the messages that are posted in a linked text channel. The bot uses the VOICEVOX engine (a free, locally hosted Japanese TTS engine that provides cute character voices such as Zundamon and Shikoku Metan) to synthesize speech.

The system also includes a Windows launcher script (`start.bat`) so that a non-technical user can start the bot with a double-click, and a documented verification procedure so that the operator can confirm the bot actually works end to end.

The primary goals are: (1) reliable joining and leaving of voice channels, (2) accurate reading of text-channel messages, (3) graceful handling of content that is difficult to read aloud (URLs, emojis, mentions, code blocks, long text), (4) ordered playback of multiple queued messages, and (5) simple configuration and startup on Windows.

## Glossary

- **TTS_Bot**: The Discord bot application described by this document, responsible for connecting to Discord, managing voice sessions, and playing synthesized audio.
- **VOICEVOX_Engine**: The free, locally running HTTP TTS server that converts text into audio using selectable character voices.
- **Voice_Channel**: A Discord channel that transmits audio between participants.
- **Text_Channel**: A Discord channel that transmits text messages.
- **Linked_Text_Channel**: The specific Text_Channel whose messages the TTS_Bot reads aloud during an active session.
- **Session**: The active state in which the TTS_Bot is connected to a Voice_Channel and reading messages from a Linked_Text_Channel.
- **Message_Queue**: The ordered list of pending text items awaiting synthesis and playback.
- **Speaker_ID**: The numeric identifier that VOICEVOX_Engine uses to select a specific character voice and style.
- **Operator**: The person who installs, configures, and starts the TTS_Bot.
- **Command_Prefix**: The configured character sequence that identifies a text message as a TTS_Bot command.
- **Config**: The set of configuration values (Discord bot token, VOICEVOX_Engine endpoint URL, default Speaker_ID, Command_Prefix, and reading limits) that the TTS_Bot loads at startup.
- **Start_Script**: The Windows batch file (`start.bat`) that launches the TTS_Bot.

## Requirements

### Requirement 1: Join a Voice Channel

**User Story:** As a Discord user, I want the bot to join my current voice channel on command, so that it can read messages aloud to me.

#### Acceptance Criteria

1. WHEN the TTS_Bot receives a join command from a user who is connected to a Voice_Channel, THE TTS_Bot SHALL connect to that Voice_Channel and start a Session.
2. WHEN the TTS_Bot successfully joins a Voice_Channel, THE TTS_Bot SHALL set the Linked_Text_Channel to the Text_Channel where the join command was received.
3. WHEN the TTS_Bot successfully joins a Voice_Channel, THE TTS_Bot SHALL post a confirmation message to the Linked_Text_Channel.
4. IF the TTS_Bot receives a join command from a user who is not connected to any Voice_Channel, THEN THE TTS_Bot SHALL post a message instructing the user to join a Voice_Channel first.
5. IF the TTS_Bot receives a join command while already in an active Session, THEN THE TTS_Bot SHALL move to the requesting user's Voice_Channel and update the Linked_Text_Channel.

### Requirement 2: Leave a Voice Channel

**User Story:** As a Discord user, I want the bot to leave the voice channel on command, so that I can end the read-aloud session.

#### Acceptance Criteria

1. WHEN the TTS_Bot receives a leave command during an active Session, THE TTS_Bot SHALL disconnect from the Voice_Channel and end the Session.
2. WHEN the TTS_Bot ends a Session, THE TTS_Bot SHALL clear the Message_Queue.
3. WHEN the TTS_Bot ends a Session, THE TTS_Bot SHALL post a confirmation message to the Linked_Text_Channel.
4. IF the TTS_Bot receives a leave command while no Session is active, THEN THE TTS_Bot SHALL post a message stating that no active Session exists.
5. WHILE a Session is active AND all human participants have left the Voice_Channel, THE TTS_Bot SHALL disconnect from the Voice_Channel and end the Session.
6. WHEN the TTS_Bot ends a Session because all human participants have left the Voice_Channel, THE TTS_Bot SHALL post a session-end confirmation message to the Linked_Text_Channel.

### Requirement 3: Read Text Messages Aloud

**User Story:** As a Discord user, I want the bot to read new messages from the linked text channel aloud, so that I can hear chat content without reading the screen.

#### Acceptance Criteria

1. WHILE a Session is active, WHEN a new text message is posted in the Linked_Text_Channel by a human user, THE TTS_Bot SHALL add the message content to the Message_Queue.
2. WHILE a Session is active AND the Message_Queue contains at least one item, THE TTS_Bot SHALL synthesize the oldest queued item using VOICEVOX_Engine and play the resulting audio in the Voice_Channel.
3. WHILE a Session is active, WHEN a message is posted by the TTS_Bot itself, THE TTS_Bot SHALL exclude that message from the Message_Queue.
4. WHILE a Session is active, WHEN a message is posted by another bot account, THE TTS_Bot SHALL exclude that message from the Message_Queue.
5. WHILE a Session is active, WHEN a message that begins with the Command_Prefix is posted, THE TTS_Bot SHALL exclude that message from the Message_Queue.

### Requirement 4: Ordered Playback of Multiple Messages

**User Story:** As a Discord user, I want multiple messages to be read in the order they were sent, so that the conversation makes sense.

#### Acceptance Criteria

1. WHILE a Session is active AND multiple items are in the Message_Queue, THE TTS_Bot SHALL play the items in first-in-first-out order.
2. WHILE the TTS_Bot is playing an audio item, WHEN an additional message arrives, THE TTS_Bot SHALL append the new item to the end of the Message_Queue without interrupting current playback.
3. WHEN playback of a queued item completes, THE TTS_Bot SHALL begin playback of the next queued item within 1 second.
4. WHERE a skip command is received during playback, THE TTS_Bot SHALL stop the current item and begin the next queued item.
5. IF a skip command is received while the Message_Queue is empty, THEN THE TTS_Bot SHALL stop playback without starting a new item.

### Requirement 5: Free Cute Voice Selection

**User Story:** As an operator, I want to choose a free cute-sounding voice, so that the bot sounds pleasant to my community.

#### Acceptance Criteria

1. THE TTS_Bot SHALL synthesize all speech using VOICEVOX_Engine, which is available at no monetary cost.
2. WHEN the TTS_Bot starts, THE TTS_Bot SHALL use the default Speaker_ID defined in Config for all synthesis.
3. WHEN a user issues a voice-selection command with a valid Speaker_ID, THE TTS_Bot SHALL use that Speaker_ID for subsequent synthesis in the current Session.
4. IF a user issues a voice-selection command with a Speaker_ID that VOICEVOX_Engine does not provide, THEN THE TTS_Bot SHALL retain the previous Speaker_ID and post a message listing the available Speaker_ID values, retaining the previous Speaker_ID even when posting the message fails.
5. WHEN a user issues a command to list available voices, THE TTS_Bot SHALL post the character names and corresponding Speaker_ID values reported by VOICEVOX_Engine.

### Requirement 6: Preprocessing of Hard-to-Read Content

**User Story:** As a Discord user, I want URLs, mentions, emojis, and code to be read sensibly, so that playback stays short and understandable.

#### Acceptance Criteria

1. WHEN a queued message contains a URL, THE TTS_Bot SHALL replace the URL with a fixed spoken placeholder before synthesis.
2. WHEN a queued message contains a user, role, or channel mention, THE TTS_Bot SHALL replace the mention with the corresponding display name before synthesis.
3. WHEN a queued message contains a custom Discord emoji, THE TTS_Bot SHALL replace the custom emoji with its emoji name before synthesis.
4. WHEN a queued message contains a fenced code block, THE TTS_Bot SHALL replace the code block content with a fixed spoken placeholder before synthesis.
5. WHEN a queued message contains text longer than the reading limit defined in Config, THE TTS_Bot SHALL truncate the spoken text to the reading limit and append a fixed spoken placeholder indicating omission.
6. IF a queued message contains no readable characters after preprocessing, THEN THE TTS_Bot SHALL discard the item without synthesis.

### Requirement 7: Text Preprocessing Round-Trip Consistency

**User Story:** As a developer, I want the text preprocessing to be a well-defined transformation, so that its behavior is testable and stable.

#### Acceptance Criteria

1. THE TTS_Bot SHALL expose a preprocessing function that maps a raw message string and a mention-lookup table to a spoken-text string.
2. WHEN the preprocessing function receives a string that contains no URLs, mentions, custom emojis, or code blocks and is within the reading limit, THE TTS_Bot SHALL return that string unchanged.
3. WHEN the preprocessing function is applied to its own output, THE TTS_Bot SHALL return a result equal to that output (idempotence).
4. FOR ALL input strings, THE TTS_Bot SHALL return a spoken-text string whose length does not exceed the reading limit defined in Config.

### Requirement 8: Configuration

**User Story:** As an operator, I want to configure the bot with my token and engine settings, so that I can run my own instance without editing source code.

#### Acceptance Criteria

1. WHEN the TTS_Bot starts, THE TTS_Bot SHALL load Config from an environment file located in the application directory.
2. THE TTS_Bot SHALL read the Discord bot token, the VOICEVOX_Engine endpoint URL, the default Speaker_ID, the Command_Prefix, and the reading limit from Config.
3. IF the Discord bot token is absent from Config when the TTS_Bot starts, THEN THE TTS_Bot SHALL write an error message identifying the missing token and exit with a non-zero status code.
4. IF the VOICEVOX_Engine endpoint URL is absent from Config when the TTS_Bot starts, THEN THE TTS_Bot SHALL apply the documented default endpoint URL.
5. WHERE a configuration value other than the Discord bot token is absent from Config, THE TTS_Bot SHALL apply the documented default value for that configuration value.

### Requirement 9: VOICEVOX Engine Availability Handling

**User Story:** As an operator, I want clear behavior when the TTS engine is unavailable, so that I can diagnose problems quickly.

#### Acceptance Criteria

1. WHEN the TTS_Bot starts, THE TTS_Bot SHALL send a health-check request to the VOICEVOX_Engine endpoint.
2. WHEN the VOICEVOX_Engine health-check request succeeds at startup, THE TTS_Bot SHALL write a success message confirming the VOICEVOX_Engine connection.
3. IF the VOICEVOX_Engine health-check request fails at startup, THEN THE TTS_Bot SHALL write an error message instructing the Operator to start VOICEVOX_Engine.
4. IF a synthesis request to VOICEVOX_Engine fails during a Session, THEN THE TTS_Bot SHALL discard the current queued item and post an error message to the Linked_Text_Channel.
5. WHEN failure handling for a failed synthesis request completes successfully, THE TTS_Bot SHALL continue processing the remaining items in the Message_Queue.
6. IF any step of the failure handling for a failed synthesis request does not complete, THEN THE TTS_Bot SHALL stop processing the Message_Queue.

### Requirement 10: Commands to Control the Bot

**User Story:** As a Discord user, I want simple commands, so that I can control the bot from the text channel.

#### Acceptance Criteria

1. THE TTS_Bot SHALL recognize a command only when the message text begins with the Command_Prefix defined in Config.
2. WHEN the TTS_Bot receives a help command, THE TTS_Bot SHALL post a list of supported commands and their descriptions to the Text_Channel.
3. IF the TTS_Bot receives a message that begins with the Command_Prefix but does not name exactly one recognized command, THEN THE TTS_Bot SHALL treat the message as an unrecognized command and post a message indicating the command is unrecognized and referencing the help command.
4. WHEN the TTS_Bot receives a skip command during a Session, THE TTS_Bot SHALL stop the current item and proceed to the next queued item, proceeding to the next queued item even when stopping the current item fails.
5. WHEN the TTS_Bot receives a clear command during a Session, THE TTS_Bot SHALL remove all items from the Message_Queue.

### Requirement 11: Windows Launcher Script

**User Story:** As an operator on Windows, I want a start.bat launcher, so that I can start the bot by double-clicking it.

#### Acceptance Criteria

1. THE Start_Script SHALL launch the TTS_Bot process from the application directory when executed on Windows.
2. IF the required runtime is not found on the system path when the Start_Script runs, THEN THE Start_Script SHALL display an error message identifying the missing runtime, pause before closing, and still attempt to launch the TTS_Bot process so that the operating system reports its own error when the runtime is truly absent.
3. WHEN the TTS_Bot process exits with a non-zero status code, THE Start_Script SHALL keep the console window open and display the exit status.
4. WHERE application dependencies are not yet installed when the Start_Script runs, THE Start_Script SHALL install the dependencies before launching the TTS_Bot process.

### Requirement 12: Verification and Testing

**User Story:** As an operator, I want a documented verification procedure and automated tests, so that I can confirm the bot actually works.

#### Acceptance Criteria

1. THE TTS_Bot SHALL include automated unit tests for the preprocessing function covering URLs, mentions, custom emojis, code blocks, and length truncation.
2. THE TTS_Bot SHALL include automated unit tests for the Message_Queue ordering behavior.
3. THE TTS_Bot project SHALL include a written verification procedure that describes the steps to start VOICEVOX_Engine, start the TTS_Bot, join a Voice_Channel, post a test message, and confirm audio playback.
4. WHEN the automated test suite is executed, THE test suite SHALL report a pass or fail result for each included test.
