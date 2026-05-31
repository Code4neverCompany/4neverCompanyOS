# Story: Direct Messages

**Story ID:** slack-chat-010
**Title:** Direct Messages
**Status:** todo

## User Story

As a user, I want to send direct messages to other users, so that I can have private conversations.

## Acceptance Criteria

- [ ] AC-1: User can click on another user's name/avatar to start a DM
- [ ] AC-2: DM appears in sidebar under "Direct Messages" section
- [ ] AC-3: Messages are only visible to sender and recipient
- [ ] AC-4: DMs use same real-time WebSocket delivery as channels
- [ ] AC-5: User can see list of all DMs in sidebar, sorted by most recent
- [ ] AC-6: Unread DM count shows badge on sidebar icon

## Technical Notes

- DMs stored in `direct_messages` table (separate from channel messages)
- No channel_id for DMs, only sender_id and recipient_id
- WebSocket room per DM: `dm:{dmId}` for sender and recipient
- Query: `WHERE (sender_id = me AND recipient_id = other) OR (sender_id = other AND recipient_id = me)`
