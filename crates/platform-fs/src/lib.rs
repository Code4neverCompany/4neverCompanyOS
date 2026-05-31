//! c4n-platform-fs — Rust-side file-watching and vault reading.
//!
//! Architecture: D-4
//! Implementing stories:
//!   M2 Story 2.3  — vault reader (read-once)
//!   M2 Story 2.12-2.13 — reactive file watcher (notify-based)
//!   M4 Story 4.5 (NEVAAA-55) — story.state progress signal watcher

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tokio::sync::mpsc;

// ────────────────────────────────────────────────────────────────────────────
// Vault reader (Story 2.3)
// ────────────────────────────────────────────────────────────────────────────

pub fn package_name() -> &'static str {
    "c4n-platform-fs"
}

#[derive(Debug, Clone)]
pub struct VaultEntry {
    pub path: PathBuf,
    pub content: String,
    pub modified: SystemTime,
}

const MAX_ENTRY_BYTES: usize = 16 * 1024;
const MAX_SCAN_DEPTH: usize = 4;

pub fn recent_vault_entries(dir: &Path, limit: usize) -> std::io::Result<Vec<VaultEntry>> {
    let mut candidates: Vec<(SystemTime, PathBuf)> = Vec::new();
    collect_md_files(dir, 0, &mut candidates)?;
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
            Err(_) => continue,
        }
    }
    Ok(entries)
}

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
        Err(_) => return Ok(()),
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

// ────────────────────────────────────────────────────────────────────────────
// Story 4.5 (NEVAAA-55) — story.state progress signal watcher
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct StoryStateChange {
    pub path: String,
    pub slug: String,
    pub status: Option<String>,
    pub ts: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct StoryFrontmatter {
    status: Option<String>,
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn extract_story_slug(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

fn parse_frontmatter_status(content: &str) -> Option<String> {
    let first_lines: String = content.lines().take(100).collect::<Vec<_>>().join("\n");
    let start = first_lines.find("---")? + 3;
    let rest = &first_lines[start..];
    let end = rest.find("---")?;
    let frontmatter = &rest[..end];
    serde_yaml::from_str::<StoryFrontmatter>(frontmatter)
        .ok()
        .and_then(|f| f.status)
}

fn extract_story_status(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_frontmatter_status(&content)
}

fn collect_story_files(vault_root: &Path) -> Vec<PathBuf> {
    let projects_dir = vault_root.join("projects");
    let mut files = Vec::new();
    if !projects_dir.exists() {
        return files;
    }
    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let project_path = entry.path();
            if project_path.is_dir() {
                let stories_dir = project_path.join("bmad").join("stories");
                if stories_dir.exists() {
                    if let Ok(rd) = std::fs::read_dir(&stories_dir) {
                        for e in rd.flatten() {
                            let p = e.path();
                            if p.is_file() && p.extension().is_some_and(|e| e == "md") {
                                files.push(p);
                            }
                        }
                    }
                }
            }
        }
    }
    files
}

fn init_story_statuses(vault_root: &Path) -> HashMap<String, Option<String>> {
    let mut statuses = HashMap::new();
    for path in collect_story_files(vault_root) {
        if let Some(slug) = extract_story_slug(&path) {
            let status = extract_story_status(&path);
            statuses.insert(slug, status);
        }
    }
    statuses
}

/// Start watching `vault_root/projects/*/bmad/stories/*.md` for frontmatter
/// `status` field changes. When a story's status changes, a `StoryStateChange`
/// is sent to `tx`. Drop `tx` to stop the watcher.
pub fn watch_story_states(
    vault_root: PathBuf,
    tx: mpsc::Sender<StoryStateChange>,
) -> anyhow::Result<()> {
    let projects_dir = vault_root.join("projects");
    if !projects_dir.exists() {
        return Ok(());
    }

    let mut statuses = init_story_statuses(&vault_root);

    let (notify_tx, mut notify_rx) = tokio::sync::mpsc::channel(64);
    let notify_tx_arc = Arc::new(notify_tx);

    let mut watcher: RecommendedWatcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(
                    event.kind,
                    notify::EventKind::Modify(_) | notify::EventKind::Create(_)
                ) {
                    let _ = notify_tx_arc.blocking_send(event);
                }
            }
        })
        .map_err(|e| anyhow::anyhow!("failed to create watcher: {}", e))?;

    watcher
        .watch(&projects_dir, RecursiveMode::Recursive)
        .map_err(|e| anyhow::anyhow!("failed to watch projects dir: {}", e))?;

    let tx_clone = tx;
    tokio::spawn(async move {
        while let Some(event) = notify_rx.recv().await {
            for path in event.paths {
                if path.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                if !path.to_string_lossy().contains("/stories/") {
                    continue;
                }
                if !path.exists() {
                    continue;
                }

                let Some(slug) = extract_story_slug(&path) else {
                    continue;
                };
                let new_status = extract_story_status(&path);
                let prev = statuses.get(&slug).cloned();
                if prev.as_ref() != Some(&new_status) {
                    statuses.insert(slug.clone(), new_status.clone());
                    let change = StoryStateChange {
                        path: path.to_string_lossy().to_string(),
                        slug,
                        status: new_status,
                        ts: current_unix_ms(),
                    };
                    if tx_clone.send(change).await.is_err() {
                        return;
                    }
                }
            }
        }
    });

    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

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
        let tmp = std::env::temp_dir().join(format!("c4n-vault-test-{}", std::process::id()));
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

    #[test]
    fn parse_frontmatter_status_extracts_status() {
        let content = "---\nstatus: in-progress\n---\n\n# Story\n";
        assert_eq!(
            parse_frontmatter_status(content),
            Some("in-progress".to_string())
        );
    }

    #[test]
    fn parse_frontmatter_status_returns_none_for_no_frontmatter() {
        let content = "# Just a header\n";
        assert_eq!(parse_frontmatter_status(content), None);
    }

    #[test]
    fn parse_frontmatter_status_returns_none_for_no_status_field() {
        let content = "---\ntitle: My Story\n---\n\n# Story\n";
        assert_eq!(parse_frontmatter_status(content), None);
    }
}
