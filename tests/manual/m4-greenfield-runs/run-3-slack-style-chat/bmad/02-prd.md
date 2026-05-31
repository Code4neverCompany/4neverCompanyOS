# Product Requirements Document: SlackChat

**Project ID:** slack-chat-001
**Date:** 2026-05-31
**Author:** PM (John)
**Based on:** 01-brief.md

---

## 1. Overview

SlackChat is a real-time team chat application enabling persistent messaging through channels and direct messages, with presence indicators, file sharing, search, threads, and reactions.

---

## 2. User Personas

### 2.1 Team Member (Alice)
- Primary user: sends and receives messages
- Needs: fast message delivery, easy channel navigation, search
- Context: desktop during work hours

### 2.2 Team Admin (Bob)
- Manages channels and users
- Needs: user management, channel settings, moderation
- Context: desktop, less mobile

### 2.3 Guest User (Carol)
- External collaborator with limited access
- Needs: access to specific channels, file viewing
- Context: occasional access, mobile-friendly

---

## 3. Functional Requirements

### FR-1: Authentication
- FR-1.1: Users can register with email and password
- FR-1.2: Users can login with email and password
- FR-1.3: JWT access tokens expire after 15 minutes
- FR-1.4: Refresh tokens allow re-authentication without re-login
- FR-1.5: Users can logout (tokens invalidated)

### FR-2: Channels
- FR-2.1: Users can create public channels
- FR-2.2: Users can create private channels
- FR-2.3: Channel admins can archive channels
- FR-2.4: Users can view list of all channels
- FR-2.5: Users can join/leave channels
- FR-2.6: Users can set channel notification preferences

### FR-3: Messaging
- FR-3.1: Users can send messages in channels
- FR-3.2: Users can send direct messages to other users
- FR-3.3: Messages are delivered in real-time via WebSocket
- FR-3.4: Users can edit their own messages within 15 minutes
- FR-3.5: Users can delete their own messages
- FR-3.6: Deleted messages show "[message deleted]" placeholder
- FR-3.7: Message history loads on scroll (pagination, 50 messages per page)
- FR-3.8: Code snippets render with syntax highlighting

### FR-4: Presence
- FR-4.1: Users see online/offline status of other users
- FR-4.2: Users see "last seen" timestamp for offline users
- FR-4.3: Users can set custom status message
- FR-4.4: Users can enable Do Not Disturb mode
- FR-4.5: Presence updates broadcast in real-time

### FR-5: Search
- FR-5.1: Users can search all messages by keyword
- FR-5.2: Search can be filtered by channel
- FR-5.3: Search can be filtered by user
- FR-5.4: Search can be filtered by date range
- FR-5.5: Search results show message context (surrounding messages)

### FR-6: File Attachments
- FR-6.1: Users can attach files up to 10MB
- FR-6.2: Supported types: images, PDFs, documents, archives
- FR-6.3: Images show inline preview in chat
- FR-6.4: Files show as downloadable attachment cards
- FR-6.5: Upload progress is shown to sender

### FR-7: Threads
- FR-7.1: Users can reply to any message in a thread
- FR-7.2: Thread replies appear nested under parent message
- FR-7.3: Users can view all threads they're participating in
- FR-7.4: Threads show reply count in channel view

### FR-8: Reactions
- FR-8.1: Users can add emoji reactions to any message
- FR-8.2: Users can remove their own reactions
- FR-8.3: Reactions show count and list of reactors
- FR-8.4: Reactions update in real-time

---

## 4. Non-Functional Requirements

### NFR-1: Performance
- Message delivery latency < 500ms
- Page load time < 2 seconds
- Search response time < 1 second for < 100k messages

### NFR-2: Reliability
- WebSocket reconnection with exponential backoff
- Offline message queue (send when reconnected)
- No message loss on reconnection

### NFR-3: Security
- Passwords hashed with bcrypt (cost factor 12)
- JWT signed with HS256
- Input validation on all endpoints
- SQL injection prevention via parameterized queries

### NFR-4: Scalability
- Support up to 200 concurrent users per channel
- Database indexes on message search and timestamps

---

## 5. User Flows

### 5.1 Registration Flow
1. User navigates to app URL
2. User clicks "Register"
3. User enters name, email, password
4. System validates input and creates account
5. System redirects to login page
6. User logs in with new credentials
7. User is directed to dashboard

### 5.2 Send Message Flow
1. User selects channel from sidebar
2. User types message in input box
3. User presses Enter to send
4. Message sent to server via WebSocket
5. Server broadcasts to all channel members
6. Message appears in all clients instantly
7. Sender sees confirmation (checkmark)

### 5.3 Thread Reply Flow
1. User hovers over message
2. User clicks "Reply in thread" button
3. Thread panel opens on right side
4. User types reply in thread input
5. Reply sent and appears in thread
6. Parent message shows thread indicator

---

## 6. Data Model

### Users
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique, indexed |
| password_hash | VARCHAR(255) | bcrypt hash |
| name | VARCHAR(100) | Display name |
| avatar_url | VARCHAR(500) | Profile picture URL |
| status | ENUM | online, offline, dnd |
| status_message | VARCHAR(100) | Custom status |
| last_seen_at | TIMESTAMP | Last activity |
| created_at | TIMESTAMP | Account creation |

### Channels
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(100) | Channel name |
| is_private | BOOLEAN | Private vs public |
| topic | VARCHAR(500) | Channel description |
| created_by | UUID | FK to users |
| is_archived | BOOLEAN | Archived flag |
| created_at | TIMESTAMP | Creation time |

### Messages
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| channel_id | UUID | FK to channels |
| user_id | UUID | FK to users |
| parent_id | UUID | FK to messages (for threads) |
| content | TEXT | Message body |
| is_deleted | BOOLEAN | Soft delete flag |
| created_at | TIMESTAMP | Send time |
| updated_at | TIMESTAMP | Last edit time |

### Reactions
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| message_id | UUID | FK to messages |
| user_id | UUID | FK to users |
| emoji | VARCHAR(50) | Emoji identifier |
| created_at | TIMESTAMP | Reaction time |

### ChannelMembers
| Field | Type | Description |
|-------|------|-------------|
| channel_id | UUID | FK to channels |
| user_id | UUID | FK to users |
| role | ENUM | admin, member |
| joined_at | TIMESTAMP | Join time |

### DirectMessages
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| sender_id | UUID | FK to users |
| recipient_id | UUID | FK to users |
| content | TEXT | Message body |
| is_deleted | BOOLEAN | Soft delete flag |
| created_at | TIMESTAMP | Send time |

---

## 7. API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login, returns JWT
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Invalidate refresh token

### Users
- `GET /api/users/me` — Current user profile
- `PATCH /api/users/me` — Update profile
- `GET /api/users/:id` — Get user by ID
- `GET /api/users/search?q=` — Search users

### Channels
- `GET /api/channels` — List user's channels
- `POST /api/channels` — Create channel
- `GET /api/channels/:id` — Get channel details
- `PATCH /api/channels/:id` — Update channel
- `DELETE /api/channels/:id` — Archive channel
- `POST /api/channels/:id/join` — Join channel
- `POST /api/channels/:id/leave` — Leave channel

### Messages
- `GET /api/channels/:id/messages?before=` — Get messages (pagination)
- `POST /api/channels/:id/messages` — Send message
- `PATCH /api/messages/:id` — Edit message
- `DELETE /api/messages/:id` — Delete message

### Threads
- `GET /api/messages/:id/thread` — Get thread replies
- `POST /api/messages/:id/reply` — Reply in thread

### Reactions
- `POST /api/messages/:id/reactions` — Add reaction
- `DELETE /api/messages/:id/reactions/:emoji` — Remove reaction

### Files
- `POST /api/channels/:id/files` — Upload file
- `GET /api/files/:id` — Download file

### Search
- `GET /api/search?q=&channel=&user=&before=&after=` — Search messages

### Presence
- `GET /api/presence` — Get all users' presence
- `POST /api/presence/status` — Update own status

---

## 8. WebSocket Events

### Client → Server
- `message:send` — Send a message
- `message:edit` — Edit a message
- `message:delete` — Delete a message
- `reaction:add` — Add reaction
- `reaction:remove` — Remove reaction
- `presence:update` — Update own presence

### Server → Client
- `message:new` — New message received
- `message:edited` — Message was edited
- `message:deleted` — Message was deleted
- `reaction:added` — Reaction was added
- `reaction:removed` — Reaction was removed
- `presence:changed` — User presence changed
- `channel:updated` — Channel was updated
