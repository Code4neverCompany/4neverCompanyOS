//! Data model — JSON shapes identical to the Node backend (camelCase keys).

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_unit")]
    pub unit: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub due: Option<String>,
    #[serde(default)]
    pub today: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn default_priority() -> String {
    "P2".to_string()
}
fn default_unit() -> String {
    "general".to_string()
}
fn default_status() -> String {
    "open".to_string()
}

/// Raw creation input; every field keeps JS semantics (any JSON accepted,
/// coerced/validated exactly like the Node handler).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    #[serde(default)]
    pub title: Value,
    #[serde(default)]
    pub priority: Value,
    #[serde(default)]
    pub tags: Value,
    #[serde(default)]
    pub unit: Value,
    #[serde(default)]
    pub status: Value,
    #[serde(default)]
    pub due: Value,
    #[serde(default)]
    pub today: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub open: usize,
    pub doing: usize,
    pub done: usize,
    pub p0: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayView {
    pub date: String,
    pub tasks: Vec<Task>,
    pub counts: Counts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub exit_code: Option<i64>,
    #[serde(default)]
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub delegated_to: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDef {
    pub id: String,
    pub name: String,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub cmd: String,
    pub args: Vec<String>,
    pub description: String,
    pub available: bool,
}

// ---- vault shapes ----

/// Internal representation of a vault note read from disk.
#[derive(Debug, Clone)]
pub struct VaultNote {
    pub name: String,
    pub content: String,
    pub links: Vec<String>,
    pub updated_at: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultListItem {
    pub name: String,
    pub links: Vec<String>,
    pub backlinks: Vec<String>,
    pub updated_at: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultNoteContent {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub name: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    pub id: String,
    pub configured: bool,
    pub note: String,
}
