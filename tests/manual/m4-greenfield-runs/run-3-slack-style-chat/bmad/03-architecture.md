# Architecture Document: SlackChat

**Project ID:** slack-chat-001
**Date:** 2026-05-31
**Author:** Architect (Winston)
**Based on:** 01-brief.md, 02-prd.md

---

## 1. System Overview

SlackChat is a full-stack real-time chat application built with React (frontend), Node.js/Express (backend), Socket.io (real-time), and PostgreSQL (persistence).

### 1.1 Architecture Pattern

- **Frontend:** Single Page Application (SPA) with React 18, Vite build
- **Backend:** REST API + WebSocket server on Node.js
- **Database:** PostgreSQL with connection pooling via `pg` library
- **Real-time:** Socket.io for WebSocket abstraction
- **Auth:** JWT (access) + httpOnly cookie (refresh)

### 1.2 Directory Structure

```
slack-chat/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── context/       # React context (Auth, Socket)
│   │   ├── services/       # API client functions
│   │   ├── types/          # TypeScript interfaces
│   │   └── App.tsx
│   ├── index.html
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── routes/         # Express route handlers
│   │   ├── middleware/      # Auth, validation middleware
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.io handlers
│   │   ├── db/             # PostgreSQL client + queries
│   │   └── index.ts
│   ├── uploads/            # File storage (gitignored)
│   └── package.json
├── SPEC.md                  # This document
└── README.md
```

---

## 2. Data Model

### 2.1 Database Schema

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'offline',
  status_message VARCHAR(100),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- Channels
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  topic VARCHAR(500),
  created_by UUID REFERENCES users(id),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Channel Members
CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_search ON messages USING GIN(to_tsvector('english', content));

-- Reactions
CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- Direct Messages
CREATE TABLE direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dm_participants ON direct_messages(sender_id, recipient_id);

-- Files
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. API Surface

### 3.1 REST Endpoints

| Method | Path                               | Description              |
| ------ | ---------------------------------- | ------------------------ |
| POST   | /api/auth/register                 | Register new user        |
| POST   | /api/auth/login                    | Login, get tokens        |
| POST   | /api/auth/refresh                  | Refresh access token     |
| POST   | /api/auth/logout                   | Logout, clear cookie     |
| GET    | /api/users/me                      | Current user             |
| PATCH  | /api/users/me                      | Update profile           |
| GET    | /api/users/:id                     | Get user by ID           |
| GET    | /api/channels                      | List user's channels     |
| POST   | /api/channels                      | Create channel           |
| GET    | /api/channels/:id                  | Get channel details      |
| PATCH  | /api/channels/:id                  | Update channel           |
| DELETE | /api/channels/:id                  | Archive channel          |
| POST   | /api/channels/:id/join             | Join channel             |
| POST   | /api/channels/:id/leave            | Leave channel            |
| GET    | /api/channels/:id/messages         | Get messages (paginated) |
| POST   | /api/channels/:id/messages         | Send message             |
| PATCH  | /api/messages/:id                  | Edit message             |
| DELETE | /api/messages/:id                  | Delete message           |
| GET    | /api/messages/:id/thread           | Get thread replies       |
| POST   | /api/messages/:id/reply            | Reply in thread          |
| POST   | /api/messages/:id/reactions        | Add reaction             |
| DELETE | /api/messages/:id/reactions/:emoji | Remove reaction          |
| POST   | /api/channels/:id/files            | Upload file              |
| GET    | /api/files/:id                     | Download file            |
| GET    | /api/search                        | Search messages          |
| GET    | /api/presence                      | Get all presence         |
| POST   | /api/presence/status               | Update own status        |
| GET    | /api/dms                           | List DMs                 |
| POST   | /api/dms                           | Send DM                  |
| GET    | /api/dms/:userId                   | Get DM thread            |

### 3.2 WebSocket Events

**Client → Server:**

- `message:send` — `{ channelId, content }`
- `message:edit` — `{ messageId, content }`
- `message:delete` — `{ messageId }`
- `message:reply` — `{ parentId, content }`
- `reaction:add` — `{ messageId, emoji }`
- `reaction:remove` — `{ messageId, emoji }`
- `presence:update` — `{ status, statusMessage }`
- `channel:join` — `{ channelId }`
- `channel:leave` — `{ channelId }`

**Server → Client:**

- `message:new` — `{ message }`
- `message:edited` — `{ messageId, content }`
- `message:deleted` — `{ messageId }`
- `reaction:added` — `{ messageId, emoji, userId, count }`
- `reaction:removed` — `{ messageId, emoji, userId, count }`
- `presence:changed` — `{ userId, status, statusMessage }`
- `channel:updated` — `{ channel }`
- `error` — `{ code, message }`

---

## 4. Key Technical Decisions

### 4.1 JWT Auth Strategy

- Access token: 15min expiry, stored in React state (memory)
- Refresh token: 7 day expiry, httpOnly cookie
- Refresh flow: React API interceptor catches 401, calls /auth/refresh
- On refresh failure: redirect to login

### 4.2 Real-Time Architecture

- Socket.io namespace `/chat`
- Authentication via cookie (Socket.io middleware validates JWT)
- Room per channel: `channel:{channelId}`
- Room per DM: `dm:{dmId}`
- Redis adapter for horizontal scaling (future)

### 4.3 Message Pagination

- Initial load: latest 50 messages
- "Load more" button fetches older messages
- Cursor-based pagination using `created_at`
- Threads: fetch all replies on open (expected < 100)

### 4.4 File Upload

- Client sends multipart/form-data to `/api/channels/:id/files`
- Server generates UUID filename, stores in `uploads/`
- Original name and MIME stored in `files` table
- Client requests via `/api/files/:id` which serves with Content-Disposition

### 4.5 Full-Text Search

- PostgreSQL `to_tsvector('english', content)` indexed with GIN
- `ts_rank` for relevance scoring
- Results include channel name and timestamp

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Message delivery: p99 < 500ms
- Search response: p95 < 1s for 100k messages
- Page load: < 2s on 3G

### 5.2 Security

- bcrypt cost factor 12 for password hashing
- JWT signed with HS256, secret in env
- express-validator for input sanitization
- Helmet.js for HTTP headers
- CORS restricted to frontend origin

### 5.3 Scalability

- Connection pooling: 20 PostgreSQL connections
- Socket.io rooms for efficient broadcasting
- Database indexes on hot paths

---

## 6. Frontend Components

```
src/components/
├── auth/
│   ├── LoginForm.tsx
│   └── RegisterForm.tsx
├── channels/
│   ├── ChannelList.tsx
│   ├── ChannelItem.tsx
│   └── ChannelHeader.tsx
├── messages/
│   ├── MessageList.tsx
│   ├── MessageItem.tsx
│   ├── MessageInput.tsx
│   └── ThreadPanel.tsx
├── presence/
│   └── PresenceIndicator.tsx
├── search/
│   └── SearchBar.tsx
├── files/
│   └── FileAttachment.tsx
└── layout/
    ├── Sidebar.tsx
    ├── MainContent.tsx
    └── Header.tsx
```

---

## 7. Environment Variables

```env
# Server
DATABASE_URL=postgresql://user:pass@localhost:5432/slackchat
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-256-bit-refresh-secret
PORT=3001
NODE_ENV=development

# Client
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```
