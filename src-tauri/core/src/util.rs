//! Tiny id/timestamp helpers built on std::time only (no chrono/uuid).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

const BASE36: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Milliseconds since the Unix epoch.
pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Days-to-civil-date conversion (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Format epoch milliseconds as an ISO-8601 UTC string with milliseconds,
/// exactly like JavaScript's `new Date().toISOString()`.
pub fn iso_from_millis(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let msod = ms.rem_euclid(86_400_000);
    let (y, mo, d) = civil_from_days(days);
    let h = msod / 3_600_000;
    let mi = (msod % 3_600_000) / 60_000;
    let s = (msod % 60_000) / 1000;
    let ml = msod % 1000;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        y, mo, d, h, mi, s, ml
    )
}

/// Current time as ISO-8601 UTC string (JS `new Date().toISOString()`).
pub fn now_iso() -> String {
    iso_from_millis(now_millis())
}

/// Convert a SystemTime (e.g. a file mtime) to an ISO-8601 UTC string.
pub fn iso_from_system_time(t: SystemTime) -> String {
    let ms = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(|e| -(e.duration().as_millis() as i64));
    iso_from_millis(ms)
}

/// Local calendar date as YYYY-MM-DD (mirrors Node's `localDate()`).
/// On Windows this uses kernel32 GetLocalTime; elsewhere it falls back to UTC
/// (the sandbox/test environment runs in UTC anyway).
#[cfg(windows)]
pub fn local_date() -> String {
    #[repr(C)]
    #[derive(Default)]
    struct Systemtime {
        w_year: u16,
        w_month: u16,
        w_day_of_week: u16,
        w_day: u16,
        w_hour: u16,
        w_minute: u16,
        w_second: u16,
        w_milliseconds: u16,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLocalTime(lp_system_time: *mut Systemtime);
    }
    let mut st = Systemtime::default();
    unsafe { GetLocalTime(&mut st) };
    format!("{:04}-{:02}-{:02}", st.w_year, st.w_month, st.w_day)
}

#[cfg(not(windows))]
pub fn local_date() -> String {
    now_iso()[..10].to_string()
}

fn to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(BASE36[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap()
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_rand() -> u64 {
    let c = COUNTER.fetch_add(1, Ordering::Relaxed);
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| (d.subsec_nanos() as u64) ^ d.as_secs())
        .unwrap_or(0xDEADBEEF);
    let mut s = (n ^ c.wrapping_mul(0x9E37_79B9_7F4A_7C15)) | 1;
    s ^= s << 13;
    s ^= s >> 7;
    s ^= s << 17;
    s.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// Generate an id like the Node version: `Date.now().toString(36) + '-' + 8
/// random base36 chars`.
pub fn gen_id() -> String {
    let t = to_base36(now_millis().max(0) as u64);
    let mut v = next_rand();
    let mut suffix = String::with_capacity(8);
    for _ in 0..8 {
        suffix.push(BASE36[(v % 36) as usize] as char);
        v /= 36;
        if v == 0 {
            v = next_rand();
        }
    }
    format!("{}-{}", t, suffix)
}

// ---------------------------------------------------------------------------
// Small JS-semantics helpers shared by tasks/notes/config/agents.
// ---------------------------------------------------------------------------

/// JS truthiness for a JSON value (`Boolean(v)`).
pub fn js_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// JS `String(v)` approximation for JSON values.
pub fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(js_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

/// `typeof v === 'string' ? v.trim() : ''` — returns None when the trimmed
/// result is empty (i.e. falsy in JS).
pub fn nonempty_trimmed_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        _ => None,
    }
}

/// Clamp a byte index into `s` down to the nearest char boundary.
pub fn floor_char_boundary(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn iso_format_matches_js() {
        assert_eq!(iso_from_millis(0), "1970-01-01T00:00:00.000Z");
        // `date -u -d @1783773296` => 2026-07-11T12:34:56 UTC
        assert_eq!(iso_from_millis(1_783_773_296_789), "2026-07-11T12:34:56.789Z");
        assert_eq!(iso_from_millis(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn gen_id_format() {
        let id = gen_id();
        let parts: Vec<&str> = id.splitn(2, '-').collect();
        assert_eq!(parts.len(), 2);
        assert!(parts[0].chars().all(|c| c.is_ascii_alphanumeric()));
        assert_eq!(parts[1].len(), 8);
        assert_ne!(gen_id(), gen_id());
    }

    #[test]
    fn js_helpers() {
        assert!(js_truthy(&json!("x")));
        assert!(!js_truthy(&json!("")));
        assert!(!js_truthy(&json!(0)));
        assert!(js_truthy(&json!([])));
        assert!(!js_truthy(&Value::Null));
        assert_eq!(js_string(&json!(3)), "3");
        assert_eq!(js_string(&Value::Null), "null");
        assert_eq!(nonempty_trimmed_string(&json!("  hi ")).as_deref(), Some("hi"));
        assert_eq!(nonempty_trimmed_string(&json!("   ")), None);
        assert_eq!(nonempty_trimmed_string(&json!(5)), None);
    }
}
