# Story: File Attachments

**Story ID:** slack-chat-007
**Title:** File Attachments
**Status:** todo

## User Story

As a user, I want to attach files to messages, so that I can share documents and images with my team.

## Acceptance Criteria

- [ ] AC-1: User can click attach button or drag-and-drop files into chat
- [ ] AC-2: Supported files: images (jpg, png, gif, webp), PDFs, docs (pdf, doc, docx, txt)
- [ ] AC-3: Max file size: 10MB per file
- [ ] AC-4: Upload shows progress bar
- [ ] AC-5: Images render inline preview in chat
- [ ] AC-6: Other files show as attachment card with filename, size, download button
- [ ] AC-7: Oversized files show error "File exceeds 10MB limit"

## Technical Notes

- Endpoint: `POST /api/channels/:id/files` (multipart/form-data)
- Files stored in `uploads/` directory with UUID filenames
- Original filename preserved in database
- Images resized client-side if > 2000px for preview
- Content-Disposition header for downloads
