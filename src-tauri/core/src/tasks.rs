//! Task CRUD, filters and the Today view — ports the /api/tasks and
//! /api/today handlers from server.js.

use serde_json::Value;

use crate::model::{Counts, Task, TaskInput, TodayView};
use crate::util::{js_string, js_truthy, nonempty_trimmed_string, now_iso};

pub const UNITS: [&str; 5] = [
    "aiart4never",
    "4nevercompany",
    "master4broker",
    "master4never",
    "general",
];
pub const PRIORITIES: [&str; 4] = ["P0", "P1", "P2", "P3"];
pub const TASK_STATUSES: [&str; 3] = ["open", "doing", "done"];

fn priority_index(p: &str) -> i32 {
    PRIORITIES.iter().position(|x| *x == p).map(|i| i as i32).unwrap_or(-1)
}

fn str_in(list: &[&str], v: &Value) -> Option<String> {
    match v {
        Value::String(s) if list.contains(&s.as_str()) => Some(s.clone()),
        _ => None,
    }
}

fn tags_from(v: &Value) -> Option<Vec<String>> {
    v.as_array().map(|a| a.iter().map(js_string).collect())
}

/// POST /api/tasks — validate + build a new task. Err("title is required")
/// when the title is missing/empty/not a string.
pub fn create_task(input: &TaskInput) -> Result<Task, String> {
    let title = nonempty_trimmed_string(&input.title).ok_or("title is required")?;
    let now = now_iso();
    Ok(Task {
        id: crate::util::gen_id(),
        title,
        priority: str_in(&PRIORITIES, &input.priority).unwrap_or_else(|| "P2".to_string()),
        tags: tags_from(&input.tags).unwrap_or_default(),
        unit: str_in(&UNITS, &input.unit).unwrap_or_else(|| "general".to_string()),
        status: str_in(&TASK_STATUSES, &input.status).unwrap_or_else(|| "open".to_string()),
        due: match &input.due {
            Value::String(s) if !s.is_empty() => Some(s.clone()),
            _ => None,
        },
        today: js_truthy(&input.today),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// PATCH /api/tasks/:id — apply a JSON patch with the exact field rules of
/// the Node handler. Always bumps updatedAt.
pub fn apply_task_patch(task: &mut Task, patch: &Value) {
    let body = match patch.as_object() {
        Some(o) => o,
        None => {
            task.updated_at = now_iso();
            return;
        }
    };
    if let Some(v) = body.get("title") {
        if let Some(t) = nonempty_trimmed_string(v) {
            task.title = t;
        }
    }
    if let Some(v) = body.get("priority") {
        if let Some(p) = str_in(&PRIORITIES, v) {
            task.priority = p;
        }
    }
    if let Some(v) = body.get("tags") {
        if let Some(tags) = tags_from(v) {
            task.tags = tags;
        }
    }
    if let Some(v) = body.get("unit") {
        if let Some(u) = str_in(&UNITS, v) {
            task.unit = u;
        }
    }
    if let Some(v) = body.get("status") {
        if let Some(s) = str_in(&TASK_STATUSES, v) {
            task.status = s;
        }
    }
    if let Some(v) = body.get("due") {
        // JS: if (body.due === null || typeof body.due === 'string') task.due = body.due || null
        match v {
            Value::Null => task.due = None,
            Value::String(s) => task.due = if s.is_empty() { None } else { Some(s.clone()) },
            _ => {}
        }
    }
    if let Some(Value::Bool(b)) = body.get("today") {
        task.today = *b;
    }
    task.updated_at = now_iso();
}

/// GET /api/tasks — optional filters (empty strings are treated as absent,
/// like falsy query params in Express).
pub fn filter_tasks(
    tasks: Vec<Task>,
    status: Option<&str>,
    unit: Option<&str>,
    priority: Option<&str>,
) -> Vec<Task> {
    let mut out = tasks;
    if let Some(s) = status.filter(|s| !s.is_empty()) {
        out.retain(|t| t.status == s);
    }
    if let Some(u) = unit.filter(|s| !s.is_empty()) {
        out.retain(|t| t.unit == u);
    }
    if let Some(p) = priority.filter(|s| !s.is_empty()) {
        out.retain(|t| t.priority == p);
    }
    out
}

/// GET /api/today — not-done AND (today OR P0 OR due<=date); sorted P0-first,
/// then due date (missing due sorts as 9999-12-31), then priority index.
pub fn today_view(all: &[Task], date: &str) -> TodayView {
    let mut tasks: Vec<Task> = all
        .iter()
        .filter(|t| {
            t.status != "done"
                && (t.today
                    || t.priority == "P0"
                    || t.due.as_deref().map_or(false, |d| d <= date))
        })
        .cloned()
        .collect();
    tasks.sort_by(|a, b| {
        let ap = if a.priority == "P0" { 0 } else { 1 };
        let bp = if b.priority == "P0" { 0 } else { 1 };
        ap.cmp(&bp)
            .then_with(|| {
                let ad = a.due.as_deref().unwrap_or("9999-12-31");
                let bd = b.due.as_deref().unwrap_or("9999-12-31");
                ad.cmp(bd)
            })
            .then_with(|| priority_index(&a.priority).cmp(&priority_index(&b.priority)))
    });
    let counts = Counts {
        open: all.iter().filter(|t| t.status == "open").count(),
        doing: all.iter().filter(|t| t.status == "doing").count(),
        done: all.iter().filter(|t| t.status == "done").count(),
        p0: all
            .iter()
            .filter(|t| t.priority == "P0" && t.status != "done")
            .count(),
    };
    TodayView {
        date: date.to_string(),
        tasks,
        counts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn task(id: &str, status: &str, priority: &str, due: Option<&str>, today: bool) -> Task {
        Task {
            id: id.into(),
            title: id.into(),
            priority: priority.into(),
            tags: vec![],
            unit: "general".into(),
            status: status.into(),
            due: due.map(String::from),
            today,
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn today_filters_not_done_and_flags() {
        let date = "2026-07-10";
        let all = vec![
            task("done-p0", "done", "P0", None, true), // excluded: done
            task("plain", "open", "P2", None, false),  // excluded: nothing matches
            task("flagged", "open", "P3", None, true), // included: today flag
            task("p0", "doing", "P0", None, false),    // included: P0
            task("overdue", "open", "P2", Some("2026-07-01"), false), // included: due <= date
            task("due-today", "open", "P2", Some("2026-07-10"), false), // included: due == date
            task("future", "open", "P2", Some("2026-08-01"), false), // excluded: due > date
        ];
        let view = today_view(&all, date);
        let ids: Vec<&str> = view.tasks.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"flagged"));
        assert!(ids.contains(&"p0"));
        assert!(ids.contains(&"overdue"));
        assert!(ids.contains(&"due-today"));
        assert!(!ids.contains(&"done-p0"));
        assert!(!ids.contains(&"plain"));
        assert!(!ids.contains(&"future"));
    }

    #[test]
    fn today_sorts_p0_first_then_due_then_priority() {
        let date = "2026-07-10";
        let all = vec![
            task("b-due-late", "open", "P1", Some("2026-07-09"), true),
            task("c-no-due", "open", "P1", None, true),
            task("a-p0", "open", "P0", Some("2026-07-20"), false),
            task("d-due-early", "open", "P2", Some("2026-07-01"), true),
            task("e-p0-early", "open", "P0", Some("2026-07-01"), false),
            task("f-no-due-p3", "open", "P3", None, true),
            task("g-no-due-p1", "open", "P1", None, true),
        ];
        let view = today_view(&all, date);
        let ids: Vec<&str> = view.tasks.iter().map(|t| t.id.as_str()).collect();
        // P0s first (by due), then the rest by due, no-due last by priority idx
        assert_eq!(
            ids,
            vec![
                "e-p0-early",
                "a-p0",
                "d-due-early",
                "b-due-late",
                "c-no-due",
                "g-no-due-p1",
                "f-no-due-p3"
            ]
        );
    }

    #[test]
    fn today_counts() {
        let all = vec![
            task("1", "open", "P0", None, false),
            task("2", "doing", "P2", None, false),
            task("3", "done", "P0", None, false),
            task("4", "open", "P2", None, false),
        ];
        let view = today_view(&all, "2026-07-10");
        assert_eq!(view.counts.open, 2);
        assert_eq!(view.counts.doing, 1);
        assert_eq!(view.counts.done, 1);
        assert_eq!(view.counts.p0, 1); // done P0 not counted
        assert_eq!(view.date, "2026-07-10");
    }

    #[test]
    fn create_task_defaults_and_validation() {
        let err = create_task(&TaskInput::default()).unwrap_err();
        assert_eq!(err, "title is required");
        let err = create_task(&serde_json::from_value(json!({ "title": "   " })).unwrap())
            .unwrap_err();
        assert_eq!(err, "title is required");

        let input: TaskInput = serde_json::from_value(json!({
            "title": "  Ship it  ",
            "priority": "P9",
            "unit": "nope",
            "status": "weird",
            "tags": ["a", 3, null],
            "due": "",
            "today": "yes"
        }))
        .unwrap();
        let t = create_task(&input).unwrap();
        assert_eq!(t.title, "Ship it");
        assert_eq!(t.priority, "P2");
        assert_eq!(t.unit, "general");
        assert_eq!(t.status, "open");
        assert_eq!(t.tags, vec!["a", "3", "null"]);
        assert_eq!(t.due, None);
        assert!(t.today); // Boolean("yes") === true

        let input: TaskInput = serde_json::from_value(json!({
            "title": "x", "priority": "P0", "unit": "master4broker",
            "status": "doing", "due": "2026-01-01", "today": false
        }))
        .unwrap();
        let t = create_task(&input).unwrap();
        assert_eq!(t.priority, "P0");
        assert_eq!(t.unit, "master4broker");
        assert_eq!(t.status, "doing");
        assert_eq!(t.due.as_deref(), Some("2026-01-01"));
        assert!(!t.today);
        assert!(t.id.contains('-'));
        assert_eq!(t.created_at, t.updated_at);
    }

    #[test]
    fn patch_rules() {
        let mut t = task("t", "open", "P2", Some("2026-01-01"), false);
        apply_task_patch(
            &mut t,
            &json!({
                "title": "   ",          // ignored (empty after trim)
                "priority": "P0",
                "status": "nope",        // ignored (invalid)
                "due": null,              // cleared
                "today": true
            }),
        );
        assert_eq!(t.title, "t");
        assert_eq!(t.priority, "P0");
        assert_eq!(t.status, "open");
        assert_eq!(t.due, None);
        assert!(t.today);

        apply_task_patch(&mut t, &json!({ "due": "" })); // '' || null -> null
        assert_eq!(t.due, None);
        apply_task_patch(&mut t, &json!({ "due": "2027-02-02", "today": "x" }));
        assert_eq!(t.due.as_deref(), Some("2027-02-02"));
        assert!(t.today); // non-bool today ignored
    }

    #[test]
    fn filters() {
        let all = vec![
            task("1", "open", "P0", None, false),
            task("2", "doing", "P1", None, false),
        ];
        assert_eq!(filter_tasks(all.clone(), Some("open"), None, None).len(), 1);
        assert_eq!(filter_tasks(all.clone(), Some(""), None, None).len(), 2);
        assert_eq!(filter_tasks(all.clone(), None, Some("general"), Some("P1")).len(), 1);
        assert_eq!(filter_tasks(all, None, None, Some("P3")).len(), 0);
    }
}
