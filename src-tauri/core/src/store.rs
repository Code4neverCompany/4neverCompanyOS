//! JSON file persistence with in-memory cache + data-root resolution.
//! Mirrors lib/store.js: each collection lives at `<data>/<name>.json`,
//! pretty-printed with 2-space indent and a trailing newline.

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::config;

/// Resolve the project/data root directory:
/// 1. `FOURNEVER_ROOT` env var, if set and non-empty.
/// 2. Walking up from the executable's directory, the first ancestor that
///    contains a `data/` directory. (The app builds inside
///    `<root>/src-tauri/target/{debug,release}/`, so walking up from the exe
///    reaches the project root that holds `data/` and `vault/`.)
/// 3. `I:\4neverCompanyOS` if that directory exists.
/// 4. The executable's own directory (data/ + vault/ get created there).
pub fn resolve_data_root() -> PathBuf {
    if let Ok(v) = env::var("FOURNEVER_ROOT") {
        let t = v.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    let exe_dir = env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()));
    if let Some(start) = exe_dir.clone() {
        let mut dir: Option<&Path> = Some(start.as_path());
        while let Some(d) = dir {
            if d.join("data").is_dir() {
                return d.to_path_buf();
            }
            dir = d.parent();
        }
    }
    let fallback = PathBuf::from("I:\\4neverCompanyOS");
    if fallback.is_dir() {
        return fallback;
    }
    exe_dir.unwrap_or_else(|| PathBuf::from("."))
}

pub struct Store {
    root: PathBuf,
    data_dir: PathBuf,
    vault_dir: PathBuf,
    cache: HashMap<String, Value>,
}

impl Store {
    /// Create a store rooted at `root`; ensures `<root>/data` exists
    /// (like `new Store(DATA_DIR)` in Node).
    pub fn new(root: impl Into<PathBuf>) -> Store {
        let root: PathBuf = root.into();
        let data_dir = root.join("data");
        let vault_dir = root.join("vault");
        if !data_dir.is_dir() {
            let _ = fs::create_dir_all(&data_dir);
        }
        Store {
            root,
            data_dir,
            vault_dir,
            cache: HashMap::new(),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn vault_dir(&self) -> &Path {
        &self.vault_dir
    }

    pub fn file_path(&self, name: &str) -> PathBuf {
        self.data_dir.join(format!("{}.json", name))
    }

    /// Read a collection; on missing/corrupt file return a copy of `fallback`
    /// (and cache it), exactly like the Node store.
    pub fn read(&mut self, name: &str, fallback: Value) -> Value {
        if let Some(v) = self.cache.get(name) {
            return v.clone();
        }
        let value = fs::read_to_string(self.file_path(name))
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or(fallback);
        self.cache.insert(name.to_string(), value.clone());
        value
    }

    /// Write a collection to cache + disk (pretty JSON, trailing newline).
    pub fn write(&mut self, name: &str, value: Value) {
        self.cache.insert(name.to_string(), value.clone());
        let pretty = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "null".to_string());
        let _ = fs::write(self.file_path(name), pretty + "\n");
    }

    /// Create the file with a default value only if it does not exist yet.
    pub fn seed(&mut self, name: &str, fallback: Value) {
        if !self.file_path(name).exists() {
            self.write(name, fallback);
        }
    }

    /// Seed all collections with the same defaults as server.js boot.
    ///
    /// Vault seeding: the Node server embeds six seed notes and writes any
    /// that are missing. The Rust port does not embed them — the existing
    /// `vault/` directory (found via data-root resolution) already contains
    /// those notes at runtime; we only make sure the directory exists so a
    /// fresh install still gets a working (empty) vault.
    pub fn seed_defaults(&mut self) {
        self.seed("tasks", Value::Array(vec![]));
        self.seed("notes", Value::Array(vec![]));
        self.seed("runs", Value::Array(vec![]));
        self.seed("config", config::default_config());
        if !self.vault_dir.is_dir() {
            let _ = fs::create_dir_all(&self.vault_dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_root(tag: &str) -> PathBuf {
        let p = env::temp_dir().join(format!("fournever-store-{}-{}", tag, crate::util::gen_id()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn seed_and_read_write_roundtrip() {
        let root = temp_root("rw");
        let mut store = Store::new(&root);
        store.seed_defaults();
        assert!(root.join("data").join("tasks.json").exists());
        assert!(root.join("data").join("config.json").exists());
        assert!(root.join("vault").is_dir());

        // seed must not overwrite existing content
        store.write("tasks", json!([{ "id": "x" }]));
        store.seed("tasks", json!([]));
        let tasks = store.read("tasks", json!([]));
        assert_eq!(tasks[0]["id"], "x");

        // fresh store instance reads from disk
        let mut store2 = Store::new(&root);
        let tasks2 = store2.read("tasks", json!([]));
        assert_eq!(tasks2[0]["id"], "x");

        // corrupt file -> fallback
        fs::write(store2.file_path("notes"), "{ not json").unwrap();
        let mut store3 = Store::new(&root);
        assert_eq!(store3.read("notes", json!([1])), json!([1]));

        // file format: pretty + trailing newline
        let raw = fs::read_to_string(store.file_path("tasks")).unwrap();
        assert!(raw.ends_with("\n"));
        assert!(raw.contains("  \"id\": \"x\""));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_root_env_override() {
        // The env-var branch is the only one that is deterministic in tests.
        let root = temp_root("env");
        env::set_var("FOURNEVER_ROOT", &root);
        assert_eq!(resolve_data_root(), root);
        env::remove_var("FOURNEVER_ROOT");
        let _ = fs::remove_dir_all(&root);
    }
}
