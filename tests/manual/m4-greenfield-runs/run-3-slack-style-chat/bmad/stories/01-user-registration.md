# Story: User Registration

**Story ID:** slack-chat-001
**Title:** User Registration
**Status:** todo

## User Story

As a new visitor, I want to register an account with email and password, so that I can access the chat platform.

## Acceptance Criteria

- [ ] AC-1: Registration form shows fields for name, email, password, and confirm password
- [ ] AC-2: Email must be valid format and unique
- [ ] AC-3: Password must be at least 8 characters
- [ ] AC-4: Password and confirm password must match
- [ ] AC-5: On success, user is redirected to login page with success message
- [ ] AC-6: On failure, error messages display inline next to invalid fields

## Technical Notes

- Endpoint: `POST /api/auth/register`
- Validation: express-validator
- Password hashing: bcrypt with cost factor 12
- Response: `{ user: { id, email, name }, message: "Registration successful" }`
