# Story: User Login

**Story ID:** slack-chat-002
**Title:** User Login
**Status:** todo

## User Story

As a registered user, I want to login with email and password, so that I can access my account and start chatting.

## Acceptance Criteria

- [ ] AC-1: Login form shows fields for email and password
- [ ] AC-2: Valid credentials return access token (15min) and refresh token
- [ ] AC-3: Invalid credentials return 401 with "Invalid email or password"
- [ ] AC-4: After login, user is redirected to dashboard
- [ ] AC-5: Access token stored in memory, refresh token in httpOnly cookie

## Technical Notes

- Endpoint: `POST /api/auth/login`
- JWT access token expires in 15 minutes
- Refresh token stored in httpOnly cookie, expires in 7 days
- Tokens signed with HS256 using secret from env
