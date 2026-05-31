# Story: Channel Creation

**Story ID:** slack-chat-003
**Title:** Channel Creation
**Status:** todo

## User Story

As a team member, I want to create channels for different topics, so that conversations are organized.

## Acceptance Criteria

- [ ] AC-1: User can create a public channel by entering name and optional topic
- [ ] AC-2: User can create a private channel (toggle "Make private")
- [ ] AC-3: Channel name must be unique, 2-100 characters, alphanumeric + hyphens/underscores
- [ ] AC-4: Creator becomes channel admin automatically
- [ ] AC-5: After creation, user is redirected to the new channel
- [ ] AC-6: Channel appears in sidebar for all users (public) or invited users (private)

## Technical Notes

- Endpoint: `POST /api/channels`
- Creator added to ChannelMembers with role=admin
- Public channels broadcast `channel:created` event
