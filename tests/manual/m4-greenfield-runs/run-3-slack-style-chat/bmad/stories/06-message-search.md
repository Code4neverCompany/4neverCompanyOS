# Story: Message Search

**Story ID:** slack-chat-006
**Title:** Message Search
**Status:** todo

## User Story

As a user, I want to search message history, so that I can find important information from the past.

## Acceptance Criteria

- [ ] AC-1: Search bar in header accepts text query
- [ ] AC-2: Results show matching messages with surrounding context (2 messages above/below)
- [ ] AC-3: Clicking result jumps to message in channel
- [ ] AC-4: Filters available: channel, user, date range
- [ ] AC-5: Search uses PostgreSQL full-text search with tsquery
- [ ] AC-6: Results paginated (20 per page)
- [ ] AC-7: Empty query shows "Enter a search term"

## Technical Notes

- Endpoint: `GET /api/search?q=&channel=&user=&before=&after=`
- PostgreSQL `to_tsvector('english', content)` for full-text indexing
- `ts_rank` for relevance ordering
- Index on messages(channel_id, created_at)
