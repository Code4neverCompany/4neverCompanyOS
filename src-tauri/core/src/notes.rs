//! Quick notes — ports the /api/notes handlers from server.js.

use std::cmp::Ordering;

use serde_json::Value;

use crate::model::Note;
use crate::util::{gen_id, nonempty_trimmed_string, now_iso};

/// POST /api/notes.
pub fn create_note(title: &str, body: &str) -> Result<Note, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title is required".to_string());
    }
    let now = now_iso();
    Ok(Note {
        id: gen_id(),
        title: title.to_string(),
        body: body.to_string(),
        pinned: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// GET /api/notes ordering: pinned first, then createdAt descending.
pub fn sort_notes(notes: &mut [Note]) {
    notes.sort_by(|a, b| {
        if a.pinned != b.pinned {
            return if a.pinned { Ordering::Less } else { Ordering::Greater };
        }
        b.created_at.cmp(&a.created_at)
    });
}

/// PATCH /api/notes/:id.
pub fn apply_note_patch(note: &mut Note, patch: &Value) {
    if let Some(body) = patch.as_object() {
        if let Some(v) = body.get("title") {
            if let Some(t) = nonempty_trimmed_string(v) {
                note.title = t;
            }
        }
        if let Some(Value::String(s)) = body.get("body") {
            note.body = s.clone();
        }
        if let Some(Value::Bool(b)) = body.get("pinned") {
            note.pinned = *b;
        }
    }
    note.updated_at = now_iso();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn note(id: &str, pinned: bool, created: &str) -> Note {
        Note {
            id: id.into(),
            title: id.into(),
            body: String::new(),
            pinned,
            created_at: created.into(),
            updated_at: created.into(),
        }
    }

    #[test]
    fn create_and_validate() {
        assert_eq!(create_note("  ", "x").unwrap_err(), "title is required");
        let n = create_note(" Hello ", "body text").unwrap();
        assert_eq!(n.title, "Hello");
        assert_eq!(n.body, "body text");
        assert!(!n.pinned);
    }

    #[test]
    fn sorting_pinned_then_created_desc() {
        let mut notes = vec![
            note("old", false, "2026-01-01T00:00:00.000Z"),
            note("new", false, "2026-06-01T00:00:00.000Z"),
            note("pinned-old", true, "2025-01-01T00:00:00.000Z"),
        ];
        sort_notes(&mut notes);
        let ids: Vec<&str> = notes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["pinned-old", "new", "old"]);
    }

    #[test]
    fn patch_rules() {
        let mut n = note("n", false, "2026-01-01T00:00:00.000Z");
        apply_note_patch(&mut n, &json!({ "title": "", "body": "b", "pinned": true }));
        assert_eq!(n.title, "n"); // empty title ignored
        assert_eq!(n.body, "b");
        assert!(n.pinned);
        apply_note_patch(&mut n, &json!({ "pinned": "nope" }));
        assert!(n.pinned); // non-bool ignored
    }
}
