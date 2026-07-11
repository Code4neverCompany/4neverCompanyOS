//! Config deep-merge, secret masking, integration status stubs —
//! ports lib/integrations.js.

use serde_json::{json, Map, Value};

use crate::model::IntegrationStatus;
use crate::util::{js_string, js_truthy};

pub fn default_config() -> Value {
    json!({
        "slack": { "token": "", "channel": "" },
        "notion": { "token": "", "databaseId": "" },
        "mcpServers": {},
        "customAgents": []
    })
}

pub fn is_plain_object(v: &Value) -> bool {
    v.is_object()
}

/// Deep-merge `patch` into `target`. Incoming string values containing the
/// mask character "•" are ignored so a round-tripped masked config never
/// overwrites a real secret.
pub fn deep_merge(target: &Value, patch: &Value) -> Value {
    let mut out: Map<String, Value> = match target {
        Value::Object(m) => m.clone(),
        _ => Map::new(),
    };
    if let Value::Object(pm) = patch {
        for (key, value) in pm {
            if let Value::String(s) = value {
                if s.contains('•') {
                    continue;
                }
            }
            let merged = if value.is_object() && out.get(key).map_or(false, |v| v.is_object()) {
                deep_merge(&out[key], value)
            } else {
                value.clone()
            };
            out.insert(key.clone(), merged);
        }
    }
    Value::Object(out)
}

/// `'••••' + s.slice(-4)`; falsy values become ''.
pub fn mask_token(v: Option<&Value>) -> String {
    let v = match v {
        None => return String::new(),
        Some(v) => v,
    };
    if !js_truthy(v) {
        return String::new();
    }
    let s = js_string(v);
    let chars: Vec<char> = s.chars().collect();
    let start = chars.len().saturating_sub(4);
    let tail: String = chars[start..].iter().collect();
    format!("••••{}", tail)
}

/// Copy of config with slack.token / notion.token masked.
pub fn mask_config(config: &Value) -> Value {
    let mut c = if config.is_object() {
        config.clone()
    } else {
        json!({})
    };
    if let Some(slack) = c.get_mut("slack").filter(|v| v.is_object()) {
        let masked = mask_token(slack.get("token"));
        slack["token"] = Value::String(masked);
    }
    if let Some(notion) = c.get_mut("notion").filter(|v| v.is_object()) {
        let masked = mask_token(notion.get("token"));
        notion["token"] = Value::String(masked);
    }
    c
}

/// Integration status stubs (no live API calls).
pub fn integrations_status(config: &Value) -> Vec<IntegrationStatus> {
    let empty = json!({});
    let cfg = if config.is_object() { config } else { &empty };
    let slack = cfg.get("slack").filter(|v| v.is_object()).unwrap_or(&empty);
    let notion = cfg.get("notion").filter(|v| v.is_object()).unwrap_or(&empty);
    let mcp_servers = cfg
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut list = Vec::new();

    let slack_token = slack.get("token").map(js_truthy).unwrap_or(false);
    let slack_channel = slack.get("channel").map(js_truthy).unwrap_or(false);
    let slack_configured = slack_token && slack_channel;
    list.push(IntegrationStatus {
        id: "slack".to_string(),
        configured: slack_configured,
        note: if slack_configured {
            "Slack config ready (stub — no live API calls yet).".to_string()
        } else if slack_token {
            "Add a channel in Settings to finish Slack setup.".to_string()
        } else {
            "Add bot token in Settings.".to_string()
        },
    });

    let notion_token = notion.get("token").map(js_truthy).unwrap_or(false);
    let notion_db = notion.get("databaseId").map(js_truthy).unwrap_or(false);
    let notion_configured = notion_token && notion_db;
    list.push(IntegrationStatus {
        id: "notion".to_string(),
        configured: notion_configured,
        note: if notion_configured {
            "Notion config ready (stub — no live API calls yet).".to_string()
        } else if notion_token {
            "Add a database ID in Settings to finish Notion setup.".to_string()
        } else {
            "Add integration token in Settings.".to_string()
        },
    });

    for (name, srv) in &mcp_servers {
        let command = srv.get("command");
        let has_command = srv.is_object() && command.map(js_truthy).unwrap_or(false);
        list.push(IntegrationStatus {
            id: format!("mcp:{}", name),
            configured: has_command,
            note: if has_command {
                format!(
                    "MCP server configured (command: {}). Stub — not launched by the OS.",
                    js_string(command.unwrap())
                )
            } else {
                "Add a command for this MCP server in Settings.".to_string()
            },
        });
    }

    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_merge_basics_and_mask_ignore() {
        let base = json!({ "slack": { "token": "xoxb-secret-1234", "channel": "#gen" }, "n": 1 });
        // masked value must NOT overwrite the stored secret
        let patch = json!({ "slack": { "token": "••••1234", "channel": "#ops" }, "n": 2 });
        let merged = deep_merge(&base, &patch);
        assert_eq!(merged["slack"]["token"], "xoxb-secret-1234");
        assert_eq!(merged["slack"]["channel"], "#ops");
        assert_eq!(merged["n"], 2);

        // nested objects merge; scalars/arrays replace
        let merged = deep_merge(
            &json!({ "a": { "x": 1, "y": 2 }, "arr": [1, 2] }),
            &json!({ "a": { "y": 3 }, "arr": [9] }),
        );
        assert_eq!(merged["a"]["x"], 1);
        assert_eq!(merged["a"]["y"], 3);
        assert_eq!(merged["arr"], json!([9]));

        // object replaces non-object and vice versa
        let merged = deep_merge(&json!({ "a": 1 }), &json!({ "a": { "b": 2 } }));
        assert_eq!(merged["a"]["b"], 2);
        // non-object patch -> unchanged copy of target
        let merged = deep_merge(&json!({ "a": 1 }), &json!("nope"));
        assert_eq!(merged, json!({ "a": 1 }));
        // non-object target -> starts from {}
        let merged = deep_merge(&json!(42), &json!({ "a": 1 }));
        assert_eq!(merged, json!({ "a": 1 }));
        // any "•" anywhere in a string skips that key
        let merged = deep_merge(&json!({ "k": "old" }), &json!({ "k": "abc•def" }));
        assert_eq!(merged["k"], "old");
    }

    #[test]
    fn masking() {
        assert_eq!(mask_token(Some(&json!("xoxb-abcd-9876"))), "••••9876");
        assert_eq!(mask_token(Some(&json!("ab"))), "••••ab");
        assert_eq!(mask_token(Some(&json!(""))), "");
        assert_eq!(mask_token(Some(&Value::Null)), "");
        assert_eq!(mask_token(None), "");

        let cfg = json!({
            "slack": { "token": "xoxb-secret-1234", "channel": "#gen" },
            "notion": { "token": "", "databaseId": "db" },
            "other": true
        });
        let masked = mask_config(&cfg);
        assert_eq!(masked["slack"]["token"], "••••1234");
        assert_eq!(masked["slack"]["channel"], "#gen");
        assert_eq!(masked["notion"]["token"], "");
        assert_eq!(masked["other"], true);
        // original untouched
        assert_eq!(cfg["slack"]["token"], "xoxb-secret-1234");
        // missing token key still becomes ''
        let masked = mask_config(&json!({ "slack": {} }));
        assert_eq!(masked["slack"]["token"], "");
    }

    #[test]
    fn integration_status_notes() {
        let list = integrations_status(&default_config());
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "slack");
        assert!(!list[0].configured);
        assert_eq!(list[0].note, "Add bot token in Settings.");
        assert_eq!(list[1].id, "notion");
        assert_eq!(list[1].note, "Add integration token in Settings.");

        let cfg = json!({
            "slack": { "token": "t", "channel": "" },
            "notion": { "token": "t", "databaseId": "d" },
            "mcpServers": {
                "files": { "command": "mcp-files" },
                "broken": {}
            }
        });
        let list = integrations_status(&cfg);
        assert_eq!(list[0].configured, false);
        assert_eq!(list[0].note, "Add a channel in Settings to finish Slack setup.");
        assert!(list[1].configured);
        assert_eq!(list[1].note, "Notion config ready (stub — no live API calls yet).");
        let files = list.iter().find(|s| s.id == "mcp:files").unwrap();
        assert!(files.configured);
        assert_eq!(
            files.note,
            "MCP server configured (command: mcp-files). Stub — not launched by the OS."
        );
        let broken = list.iter().find(|s| s.id == "mcp:broken").unwrap();
        assert!(!broken.configured);
        assert_eq!(broken.note, "Add a command for this MCP server in Settings.");
    }

    #[test]
    fn default_config_shape() {
        let c = default_config();
        assert_eq!(c["slack"]["token"], "");
        assert_eq!(c["notion"]["databaseId"], "");
        assert!(c["mcpServers"].as_object().unwrap().is_empty());
        assert!(c["customAgents"].as_array().unwrap().is_empty());
    }
}
