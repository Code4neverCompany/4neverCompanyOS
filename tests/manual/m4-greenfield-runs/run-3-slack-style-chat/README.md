# SlackChat

Real-time team chat application.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** Node.js, Express, Socket.io
- **Database:** PostgreSQL
- **Auth:** JWT (access) + httpOnly cookie (refresh)

## Setup

```bash
# Server
cd server
cp .env.example .env  # Set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
pnpm install
pnpm db:init
pnpm dev

# Client
cd client
cp .env.example .env  # Set VITE_API_URL, VITE_WS_URL
pnpm install
pnpm dev
```

## Features

- Persistent channels and direct messages
- Real-time WebSocket messaging
- User presence (online/offline/DND)
- File attachments (up to 10MB)
- Full-text message search
- Threaded replies
- Emoji reactions
