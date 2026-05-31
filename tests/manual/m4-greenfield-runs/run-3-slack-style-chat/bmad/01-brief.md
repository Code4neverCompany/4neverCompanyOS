# Project Brief: SlackChat — Real-Time Team Chat Application

**Project ID:** slack-chat-001
**Date:** 2026-05-31
**Author:** Analyst (Mary)
**Workflow:** greenfield-fullstack

---

## 1. Project Overview

**Project Name:** SlackChat
**Type:** Real-time team chat application (web app)
**Core Functionality:** A persistent chat platform with channels, direct messages, real-time message delivery, user presence, file attachments, search, threads, and reactions.
**Target Users:** Teams, communities, and organizations needing internal communication tools.

---

## 2. Problem Statement

Teams lack a fast, reliable, and feature-rich chat platform that combines real-time messaging with persistence, searchability, and rich media support. Existing solutions are either too simple (no threads, no search) or too complex/expensive (enterprise suites).

---

## 3. Target Users

- Small to medium teams (5–200 users)
- Remote and hybrid teams needing persistent async communication
- Communities and interest groups
- Developers needing a chat platform with file/code sharing

---

## 4. Core Features

### 4.1 Messaging

- Persistent channels (public and private)
- Direct messages (DMs) between users
- Real-time message delivery via WebSockets
- Message editing and deletion
- Message timestamps and read receipts
- Code snippet sharing with syntax highlighting

### 4.2 Organization

- Channel creation, archiving, and deletion
- Channel categories (e.g., Engineering, Design, General)
- User roles (admin, member)
- Channel membership management

### 4.3 Presence

- Online/offline status indicators
- Last seen timestamps
- Do not disturb (DND) status
- Custom status messages

### 4.4 Rich Media

- File attachments (images, documents, PDFs)
- Image previews in chat
- Drag-and-drop upload
- File size limits (configurable)

### 4.5 Search & Discovery

- Full-text message search
- Search within channels
- Filter by user, date range, file type
- Jump to message functionality

### 4.6 Threads

- Threaded replies to messages
- Thread previews in channel view
- Thread notifications

### 4.7 Reactions

- Emoji reactions to messages
- Reaction counts
- Add/remove reactions

---

## 5. User Interactions & Flows

### 5.1 Authentication

- Email/password registration and login
- Session management with JWT
- Logout functionality

### 5.2 Channel Navigation

- Sidebar with channel list
- Channel categories collapsible
- Unread message indicators
- Quick channel switcher (Cmd/Ctrl+K)

### 5.3 Messaging Flow

- Type message in input box
- Send on Enter (Shift+Enter for newline)
- Messages appear instantly via WebSocket
- Reactions via hover menu
- Reply in thread via context menu

### 5.4 File Sharing Flow

- Drag file into chat or click attach button
- Upload progress indicator
- File appears as attachment card
- Click to download/view

---

## 6. Technical Constraints

- Must be a single-page application (SPA)
- Must support modern browsers (Chrome, Firefox, Safari, Edge)
- Real-time latency < 500ms for message delivery
- Message history pagination (load older messages on scroll)
- Responsive design for mobile browsers

---

## 7. Technology Stack

| Layer        | Technology                    |
| ------------ | ----------------------------- |
| Frontend     | React 18, TypeScript, Vite    |
| Backend      | Node.js, Express              |
| Real-time    | Socket.io                     |
| Database     | PostgreSQL                    |
| Auth         | JWT (access + refresh tokens) |
| File Storage | Local filesystem (uploads/)   |
| Styling      | CSS Modules or Tailwind CSS   |

---

## 8. Success Criteria

1. Users can register, login, and maintain sessions
2. Users can create and join channels
3. Messages are delivered in real-time to all channel members
4. Users can search message history
5. File attachments can be uploaded and downloaded
6. Threads work correctly for message discussions
7. Reactions can be added and removed
8. Presence indicators update in real-time
9. Application is responsive and loads within 2 seconds

---

## 9. Out of Scope (v1)

- Video/audio calls
- Screen sharing
- Channel encryption
- SSO/OAuth providers
- Mobile native apps
- Message formatting (Markdown)
- Bots and integrations
- Animated stickers/GIFs

---

## 10. Estimated Effort

**Total estimated stories:** 15–20
**Effort scale:** Medium (backend + frontend full-stack)

---

## 11. Open Questions

1. Should DMs be encrypted end-to-end? (No for v1)
2. What is the max file upload size? (Suggested: 10MB)
3. Should there be a message retention policy? (Suggested: unlimited for v1)
4. Do we need typing indicators? (Yes, included)
