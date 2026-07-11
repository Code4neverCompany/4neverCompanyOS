//! Markdown vault with [[wikilinks]] — ports the /api/vault handlers.

use std::fs;
use std::path::{Path, PathBuf};

use crate::model::{
    GraphEdge, GraphNode, SearchResult, VaultGraph, VaultListItem, VaultNote, VaultNoteContent,
};
use crate::util::{floor_char_boundary, iso_from_system_time};

/// Sanitize a note name exactly like server.js: strip NULs, path separators,
/// "..", a trailing ".md" (case-insensitive), then trim.
pub fn sanitize_vault_name(name: &str) -> String {
    let s = name.replace('\0', "");
    let s = s.replace(['\\', '/'], "");
    let s = s.replace("..", "");
    let s = strip_md_suffix(&s);
    s.trim().to_string()
}

fn strip_md_suffix(s: &str) -> String {
    if s.len() >= 3 {
        let (head, tail) = s.split_at(s.len() - 3);
        if tail.eq_ignore_ascii_case(".md") {
            return head.to_string();
        }
    }
    s.to_string()
}

fn vault_file(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{}.md", name))
}

/// Parse `[[wikilinks]]` (regex `/\[\[([^\[\]]+)\]\]/g` semantics): the part
/// before `|` is the target; duplicates are dropped case-insensitively.
pub fn parse_wiki_links(content: &str) -> Vec<String> {
    let b = content.as_bytes();
    let mut links: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i + 1 < b.len() {
        if b[i] == b'[' && b[i + 1] == b'[' {
            let start = i + 2;
            let mut j = start;
            while j < b.len() && b[j] != b'[' && b[j] != b']' {
                j += 1;
            }
            if j > start && j + 1 < b.len() && b[j] == b']' && b[j + 1] == b']' {
                let target = content[start..j].split('|').next().unwrap_or("").trim();
                if !target.is_empty()
                    && !links
                        .iter()
                        .any(|l| l.to_lowercase() == target.to_lowercase())
                {
                    links.push(target.to_string());
                }
                i = j + 2;
                continue;
            }
        }
        i += 1;
    }
    links
}

/// Read all *.md notes in the vault dir (sorted by filename for determinism).
pub fn read_vault_notes(dir: &Path) -> Vec<VaultNote> {
    let mut files: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|f| f.to_str())
                    .map(|f| f.to_lowercase().ends_with(".md"))
                    .unwrap_or(false)
            })
            .collect(),
        Err(_) => return Vec::new(),
    };
    files.sort();
    files
        .into_iter()
        .filter_map(|full| {
            let file_name = full.file_name()?.to_str()?.to_string();
            let name = file_name[..file_name.len() - 3].to_string();
            let meta = fs::metadata(&full).ok()?;
            let content = fs::read_to_string(&full).ok()?;
            let updated_at = meta
                .modified()
                .map(iso_from_system_time)
                .unwrap_or_else(|_| crate::util::now_iso());
            let links = parse_wiki_links(&content);
            Some(VaultNote {
                name,
                content,
                links,
                updated_at,
                size: meta.len(),
            })
        })
        .collect()
}

/// Resolve a wikilink target to an existing note's canonical name
/// (case-insensitive); unknown targets pass through unchanged.
pub fn canonical_name(target: &str, notes: &[VaultNote]) -> String {
    let lower = target.to_lowercase();
    notes
        .iter()
        .find(|n| n.name.to_lowercase() == lower)
        .map(|n| n.name.clone())
        .unwrap_or_else(|| target.to_string())
}

/// GET /api/vault — list with canonical links + case-insensitive backlinks.
pub fn list(dir: &Path) -> Vec<VaultListItem> {
    let notes = read_vault_notes(dir);
    notes
        .iter()
        .map(|n| {
            let links = n.links.iter().map(|l| canonical_name(l, &notes)).collect();
            let name_lower = n.name.to_lowercase();
            let backlinks = notes
                .iter()
                .filter(|other| {
                    other.name != n.name
                        && other.links.iter().any(|l| l.to_lowercase() == name_lower)
                })
                .map(|other| other.name.clone())
                .collect();
            VaultListItem {
                name: n.name.clone(),
                links,
                backlinks,
                updated_at: n.updated_at.clone(),
                size: n.size,
            }
        })
        .collect()
}

/// GET /api/vault/note.
pub fn get(dir: &Path, name: &str) -> Result<VaultNoteContent, String> {
    let name = sanitize_vault_name(name);
    if name.is_empty() {
        return Err("name is required".to_string());
    }
    let file = vault_file(dir, &name);
    if !file.exists() {
        return Err("note not found".to_string());
    }
    let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    Ok(VaultNoteContent { name, content })
}

/// PUT /api/vault/note — returns the sanitized name that was written.
pub fn put(dir: &Path, name: &str, content: &str) -> Result<String, String> {
    let name = sanitize_vault_name(name);
    if name.is_empty() {
        return Err("name is required".to_string());
    }
    if !dir.is_dir() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(vault_file(dir, &name), content).map_err(|e| e.to_string())?;
    Ok(name)
}

/// DELETE /api/vault/note.
pub fn delete(dir: &Path, name: &str) -> Result<(), String> {
    let name = sanitize_vault_name(name);
    if name.is_empty() {
        return Err("name is required".to_string());
    }
    let file = vault_file(dir, &name);
    if !file.exists() {
        return Err("note not found".to_string());
    }
    fs::remove_file(&file).map_err(|e| e.to_string())
}

/// GET /api/vault/graph — nodes include linked-but-nonexistent targets;
/// node identity is case-insensitive (first spelling seen wins, existing
/// notes registered first).
pub fn graph(dir: &Path) -> VaultGraph {
    let notes = read_vault_notes(dir);
    // insertion-ordered lowercase -> canonical map
    let mut node_names: Vec<(String, String)> = Vec::new();
    for n in &notes {
        let key = n.name.to_lowercase();
        if !node_names.iter().any(|(k, _)| *k == key) {
            node_names.push((key, n.name.clone()));
        }
    }
    let mut edges = Vec::new();
    for n in &notes {
        for link in &n.links {
            let key = link.to_lowercase();
            if !node_names.iter().any(|(k, _)| *k == key) {
                node_names.push((key.clone(), link.clone())); // linked-but-nonexistent
            }
            let to = node_names
                .iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| v.clone())
                .unwrap_or_else(|| link.clone());
            edges.push(GraphEdge {
                from: n.name.clone(),
                to,
            });
        }
    }
    VaultGraph {
        nodes: node_names
            .into_iter()
            .map(|(_, id)| GraphNode { id })
            .collect(),
        edges,
    }
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// GET /api/vault/search — case-insensitive substring search over content and
/// names, with a ±(40/60) char snippet around the first content match.
pub fn search(dir: &Path, q: &str) -> Vec<SearchResult> {
    let q = q.to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    let mut results = Vec::new();
    for n in read_vault_notes(dir) {
        let content_lower = n.content.to_lowercase();
        let content_idx = content_lower.find(&q);
        let name_match = n.name.to_lowercase().contains(&q);
        if content_idx.is_none() && !name_match {
            continue;
        }
        let snippet = match content_idx {
            Some(idx) => {
                let start = floor_char_boundary(&n.content, idx.saturating_sub(40));
                let end_raw = idx + q.len() + 60;
                let end = floor_char_boundary(&n.content, end_raw.min(n.content.len()));
                let mut s = collapse_ws(&n.content[start.min(end)..end]);
                if start > 0 {
                    s = format!("…{}", s);
                }
                if end_raw < n.content.len() {
                    s.push('…');
                }
                s
            }
            None => {
                let end = floor_char_boundary(&n.content, 100.min(n.content.len()));
                collapse_ws(&n.content[..end])
            }
        };
        results.push(SearchResult {
            name: n.name,
            snippet,
        });
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn temp_vault(tag: &str) -> PathBuf {
        let p = env::temp_dir().join(format!("fournever-vault-{}-{}", tag, crate::util::gen_id()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn wikilink_parsing() {
        assert_eq!(
            parse_wiki_links("See [[Alpha]] and [[Beta|the beta note]]."),
            vec!["Alpha", "Beta"]
        );
        // dedupe is case-insensitive, first spelling wins
        assert_eq!(parse_wiki_links("[[Foo]] [[foo]] [[FOO]]"), vec!["Foo"]);
        // no nested/broken brackets, empty targets skipped
        assert_eq!(parse_wiki_links("[[a[[b]] [[ ]] [[]] [x] [[c]]"), vec!["b", "c"]);
        assert_eq!(parse_wiki_links("no links here"), Vec::<String>::new());
        // target is trimmed; alias part ignored
        assert_eq!(parse_wiki_links("[[  spaced name  | alias ]]"), vec!["spaced name"]);
    }

    #[test]
    fn name_sanitization() {
        assert_eq!(sanitize_vault_name("Welcome"), "Welcome");
        assert_eq!(sanitize_vault_name("Welcome.md"), "Welcome");
        assert_eq!(sanitize_vault_name("Welcome.MD"), "Welcome");
        assert_eq!(sanitize_vault_name("../../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_vault_name("a/b\\c"), "abc");
        assert_eq!(sanitize_vault_name("dot..dot"), "dotdot");
        assert_eq!(sanitize_vault_name("  padded  "), "padded");
        assert_eq!(sanitize_vault_name("nul\0byte"), "nulbyte");
        assert_eq!(sanitize_vault_name("...."), "");
        assert_eq!(sanitize_vault_name(""), "");
    }

    #[test]
    fn links_backlinks_case_insensitive_and_graph() {
        let dir = temp_vault("graph");
        fs::write(dir.join("Alpha.md"), "Links to [[beta]] and [[Ghost]].").unwrap();
        fs::write(dir.join("Beta.md"), "Back to [[ALPHA]].").unwrap();

        let items = list(&dir);
        let alpha = items.iter().find(|i| i.name == "Alpha").unwrap();
        // canonical link resolution: [[beta]] -> "Beta"
        assert_eq!(alpha.links, vec!["Beta", "Ghost"]);
        assert_eq!(alpha.backlinks, vec!["Beta"]);
        let beta = items.iter().find(|i| i.name == "Beta").unwrap();
        assert_eq!(beta.links, vec!["Alpha"]);
        assert_eq!(beta.backlinks, vec!["Alpha"]);

        let g = graph(&dir);
        let node_ids: Vec<&str> = g.nodes.iter().map(|n| n.id.as_str()).collect();
        // Ghost does not exist on disk but is still a node
        assert!(node_ids.contains(&"Alpha"));
        assert!(node_ids.contains(&"Beta"));
        assert!(node_ids.contains(&"Ghost"));
        assert_eq!(g.nodes.len(), 3);
        assert_eq!(g.edges.len(), 3);
        // edge targets are canonicalized case-insensitively
        assert!(g
            .edges
            .iter()
            .any(|e| e.from == "Alpha" && e.to == "Beta"));
        assert!(g
            .edges
            .iter()
            .any(|e| e.from == "Beta" && e.to == "Alpha"));
        assert!(g
            .edges
            .iter()
            .any(|e| e.from == "Alpha" && e.to == "Ghost"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crud_and_traversal_safety() {
        let dir = temp_vault("crud");
        // NOTE: the /\.md$/i strip runs BEFORE trim (like server.js), so the
        // name must not have trailing whitespace for the suffix to be removed.
        assert_eq!(put(&dir, "  Test.md", "hello world").unwrap(), "Test");
        assert!(dir.join("Test.md").exists());
        let got = get(&dir, "test.md.MD").unwrap_err(); // sanitized to "test.md" -> wait
        // note: sanitize strips only ONE trailing .md (regex /\.md$/i)
        let _ = got;
        let got = get(&dir, "Test").unwrap();
        assert_eq!(got.name, "Test");
        assert_eq!(got.content, "hello world");
        // traversal attempts collapse into plain names
        assert_eq!(put(&dir, "../escape", "x").unwrap(), "escape");
        assert!(dir.join("escape.md").exists());
        assert_eq!(get(&dir, "missing").unwrap_err(), "note not found");
        assert_eq!(get(&dir, "///").unwrap_err(), "name is required");
        delete(&dir, "Test").unwrap();
        assert!(!dir.join("Test.md").exists());
        assert_eq!(delete(&dir, "Test").unwrap_err(), "note not found");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_snippets() {
        let dir = temp_vault("search");
        let long = format!(
            "{} NEEDLE {}",
            "start ".repeat(20),   // 120 chars before
            "tail ".repeat(30)     // 150 chars after
        );
        fs::write(dir.join("Long.md"), &long).unwrap();
        fs::write(dir.join("Titled.md"), "nothing relevant inside").unwrap();

        let r = search(&dir, "needle");
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].name, "Long");
        assert!(r[0].snippet.starts_with('…'));
        assert!(r[0].snippet.ends_with('…'));
        assert!(r[0].snippet.contains("NEEDLE"));

        // name-only match falls back to the first 100 chars
        let r = search(&dir, "titled");
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].snippet, "nothing relevant inside");

        // empty query -> empty result
        assert!(search(&dir, "").is_empty());
        // case-insensitive content match at position 0: no leading ellipsis
        fs::write(dir.join("Short.md"), "Alpha beta\n\ngamma").unwrap();
        let r = search(&dir, "alpha");
        let short = r.iter().find(|x| x.name == "Short").unwrap();
        assert_eq!(short.snippet, "Alpha beta gamma"); // whitespace collapsed
        let _ = fs::remove_dir_all(&dir);
    }
}
