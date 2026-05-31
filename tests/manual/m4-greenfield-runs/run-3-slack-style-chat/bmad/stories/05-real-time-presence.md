# Story: Real-Time Presence

**Story ID:** slack-chat-005
**Title:** Real-Time Presence
**Status:** todo

## User Story

As a user, I want to see when my teammates are online, so that I know who is available to respond.

## Acceptance Criteria

- [ ] AC-1: Online users show green dot next to their name
- [ ] AC-2: Offline users show gray dot with "Last seen X minutes/hours ago"
- [ ] AC-3: Users can click status to set DND, Away, or custom message
- [ ] AC-4: Presence changes broadcast to all connected clients within 2 seconds
- [ ] AC-5: User's own presence is always shown as online

## Technical Notes

- WebSocket event: `presence:update` with `{ userId, status, statusMessage }`
- Presence stored in Redis for quick lookup (or in-memory Map for simplicity)
- Clients receive `presence:changed` events for all user changes
- Last seen updated on any user action, debounced to once per minute
