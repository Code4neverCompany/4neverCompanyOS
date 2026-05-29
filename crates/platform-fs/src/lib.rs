//! c4n-platform-fs — Rust-side file-watching and vault reading.
//! Replaces chokidar (which is weaker on Windows). Backs
//! progress-signal artifact.changed and code.changed subscribers.
//!
//! Architecture: D-4
//! Implementing stories: M2 Story 2.12-2.13 (file watcher),
//!                       M2 Story 2.3  (vault reader — this file).
//!
//! M2 ships vault_entries() for reading recent Obsidian vault entries
//! at persona spawn time. The reactive FileWatcher (notify-based) lands
//! in Stories 2.12-2.13.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-platform-fs"
}

// ────────────────────────────────────────────────────────────────────────────
// Story 2.3 — Vault reader (read-once; reactive watcher in 2.12-2.13)
// ────────────────────────────────────────────────────────────────────────────

/// A single Markdown entry from the Obsidian vault.
#[derive(Debug, Clone)]
pub struct VaultEntry {
    /// Absolute path to the file.
    pub path: PathBuf,
    /// Raw Markdown content. Silently truncated to `MAX_ENTRY_BYTES` on
    /// read so a giant daily note doesn't blow out the spawn-time budget.
    pub content: String,
    /// Last-modified time, used for sort ordering.
    pub modified: SystemTime,
}

/// Maximum bytes we read from any single vault file at spawn time.
/// 16 KB is enough for a rich daily note; avoids allocating large files.
const MAX_ENTRY_BYTES: usize = 16 * 1024;

/// Maximum depth to recurse into the vault directory tree when scanning.
/// Keeps the scan cheap on large vaults while still reaching nested notes.
const MAX_SCAN_DEPTH: usize = 4;

/// Read at most `limit` recently-modified Markdown files from `dir`
/// (recursively, up to `MAX_SCAN_DEPTH` levels). Returns entries sorted
/// newest-first. Silently skips unreadable files and non-markdown files.
///
/// Called by `spawn_designer_persona` to inject vault context into `agy.md`
/// at persona launch time. The read is synchronous and intentionally
/// cheap — it's a one-shot scan of a local SSD, not a watch loop.
pub fn recent_vault_entries(dir: &Path, limit: usize) -> std::io::Result<Vec<VaultEntry>> {
    let mut candidates: Vec<(SystemTime, PathBuf)> = Vec::new();
    collect_md_files(dir, 0, &mut candidates)?;
    // Sort newest-first, then take up to `limit`.
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    candidates.truncate(limit);

    let mut entries = Vec::with_capacity(candidates.len());
    for (modified, path) in candidates {
        match read_truncated(&path) {
            Ok(content) => entries.push(VaultEntry {
                path,
                content,
                modified,
            }),
            Err(_) => continue, // skip unreadable files silently
        }
    }
    Ok(entries)
}

/// Recursively collect `(mtime, path)` pairs for every `.md` file under `dir`.
fn collect_md_files(
    dir: &Path,
    depth: usize,
    out: &mut Vec<(SystemTime, PathBuf)>,
) -> std::io::Result<()> {
    if depth > MAX_SCAN_DEPTH {
        return Ok(());
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(()), // permission error or missing dir — skip
    };
    for entry in rd.flatten() {
        let path = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.is_dir() {
            collect_md_files(&path, depth + 1, out)?;
        } else if meta.is_file() {
            let is_md = path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("md"));
            if is_md {
                if let Ok(modified) = meta.modified() {
                    out.push((modified, path));
                }
            }
        }
    }
    Ok(())
}

/// Read a file, truncating at `MAX_ENTRY_BYTES` so we don't allocate
/// huge strings for very large daily notes or dumps.
fn read_truncated(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let f = std::fs::File::open(path)?;
    let mut buf = Vec::with_capacity(MAX_ENTRY_BYTES + 1);
    f.take((MAX_ENTRY_BYTES + 1) as u64).read_to_end(&mut buf)?;
    let truncated = buf.len() > MAX_ENTRY_BYTES;
    if truncated {
        buf.truncate(MAX_ENTRY_BYTES);
    }
    let mut s = String::from_utf8_lossy(&buf).into_owned();
    if truncated {
        s.push_str("\n\n…[truncated]");
    }
    Ok(s)
}

/// Format vault entries as a Markdown section suitable for appending to
/// a persona file (`agy.md` or `claude.md`). Each entry is rendered as
/// a level-3 heading with the filename and its content block.
pub fn format_vault_context(entries: &[VaultEntry]) -> String {
    if entries.is_empty() {
        return String::from(
            "\n_No recent vault entries found — start adding notes to your vault._\n",
        );
    }
    let mut out = String::new();
    for entry in entries {
        let name = entry
            .path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("note");
        out.push_str(&format!("\n### {name}\n\n"));
        out.push_str(&entry.content);
        if !entry.content.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-platform-fs");
    }

    #[test]
    fn recent_vault_entries_returns_empty_on_missing_dir() {
        let result = recent_vault_entries(Path::new("/nonexistent/vault/path"), 10).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn recent_vault_entries_reads_md_files() {
        let tmp =
            std::env::temp_dir().join(format!("c4n-vault-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("note-a.md"), "# Note A\nHello").unwrap();
        std::fs::write(tmp.join("not-md.txt"), "ignored").unwrap();

        let entries = recent_vault_entries(&tmp, 10).unwrap();
        assert_eq!(entries.len(), 1, "only .md files should be included");
        assert!(
            entries[0].content.contains("Hello"),
            "file content should be read"
        );

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn format_vault_context_non_empty() {
        let entry = VaultEntry {
            path: PathBuf::from("/vault/daily-notes/2026-05-29.md"),
            content: "some content".to_string(),
            modified: SystemTime::now(),
        };
        let out = format_vault_context(&[entry]);
        assert!(out.contains("2026-05-29"));
        assert!(out.contains("some content"));
    }

    #[test]
    fn format_vault_context_empty_placeholder() {
        let out = format_vault_context(&[]);
        assert!(out.contains("No recent vault entries"));
    }
}
