# Story: Message Reactions

**Story ID:** slack-chat-009
**Title:** Message Reactions
**Status:** todo

## User Story

As a user, I want to add emoji reactions to messages, so that I can give quick feedback without sending a message.

## Acceptance Criteria

- [ ] AC-1: Hovering over a message shows reaction button (emoji icon)
- [ ] AC-2: Clicking opens emoji picker
- [ ] AC-3: Selecting emoji adds reaction and broadcasts to channel
- [ ] AC-4: Reaction appears under message with emoji and count
- [ ] AC-5: Clicking existing reaction removes it (if user reacted)
- [ ] AC-6: Multiple users can react with same emoji (count increments)
- [ ] AC-7: Users can react with different emojis to same message

## Technical Notes

- Endpoint: `POST /api/messages/:id/reactions` with `{ emoji }`
- Endpoint: `DELETE /api/messages/:id/reactions/:emoji`
- Reactions table: `(message_id, user_id, emoji)` unique constraint
- WebSocket event: `reaction:added` / `reaction:removed`
- Emoji picker: use emoji-mart or similar library
