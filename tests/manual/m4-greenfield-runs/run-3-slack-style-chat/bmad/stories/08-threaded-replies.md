# Story: Threaded Replies

**Story ID:** slack-chat-008
**Title:** Threaded Replies
**Status:** todo

## User Story

As a user, I want to reply to messages in threads, so that I can have focused discussions without cluttering the channel.

## Acceptance Criteria

- [ ] AC-1: Hovering over a message shows "Reply in thread" button
- [ ] AC-2: Clicking opens thread panel on the right side
- [ ] AC-3: Thread shows parent message and all replies
- [ ] AC-4: Parent message in channel shows reply count badge
- [ ] AC-5: Thread replies send via WebSocket like regular messages
- [ ] AC-6: Users can close thread panel by clicking X or clicking elsewhere

## Technical Notes

- Parent message has `parent_id = NULL`
- Thread replies have `parent_id` pointing to parent message
- Thread replies NOT broadcast to channel subscribers, only to thread participants
- `GET /api/messages/:id/thread` returns parent + all replies
- `POST /api/messages/:id/reply` creates reply with parent_id
