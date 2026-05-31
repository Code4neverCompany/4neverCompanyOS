# Story: Send Message

**Story ID:** slack-chat-004
**Title:** Send Message
**Status:** todo

## User Story

As a channel member, I want to send messages in a channel, so that I can communicate with my team.

## Acceptance Criteria

- [ ] AC-1: User types message in input box and presses Enter to send
- [ ] AC-2: Shift+Enter inserts newline without sending
- [ ] AC-3: Message appears immediately in sender's view
- [ ] AC-4: Message broadcasts to all channel members via WebSocket within 500ms
- [ ] AC-5: Empty messages cannot be sent
- [ ] AC-6: Message shows sender name, avatar, timestamp, and content
- [ ] AC-7: Code snippets (wrapped in backticks) render with syntax highlighting

## Technical Notes

- WebSocket event: `message:send` with `{ channelId, content }`
- Server broadcasts `message:new` to all channel subscribers
- Message persisted to PostgreSQL before broadcast
- Slack-like emoji shortcodes converted to Unicode for display
