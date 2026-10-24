use chrono::{DateTime, Duration, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelStat {
    pub model: String,
    pub tokens: u64,
    pub requests: u64,
    pub cost_usd: f64,
    /// "claude" | "cursor"
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayBucket {
    pub date: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub total_tokens: u64,
    pub estimated_cost_usd: f64,
    pub claude_tokens: u64,
    pub cursor_tokens: u64,
    pub cursor_tokens_no_cache: u64,
    pub claude_cost_usd: f64,
    pub cursor_cost_usd: f64,
    pub request_count: u64,
    pub favorite_model: Option<String>,
    pub models: Vec<ModelStat>,
    pub hour_counts: Vec<u64>,
    pub claude_hour_counts: Vec<u64>,
    pub cursor_hour_counts: Vec<u64>,
    pub avg_hour: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedUsageResponse {
    pub days: Vec<DayBucket>,
    pub cursor_imported_at: Option<String>,
    pub cursor_day_count: u64,
    pub cursor_auto_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorImportResult {
    pub imported_at: String,
    pub row_count: u64,
    pub day_count: u64,
    pub total_tokens: u64,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedCursor {
    imported_at: String,
    source_path: Option<String>,
    /// Local calendar day (YYYY-MM-DD) of the last successful cursor.com API sync.
    #[serde(default)]
    last_api_sync_day: Option<String>,
    /// RFC3339 timestamp of last successful API sync (for freshness).
    #[serde(default)]
    last_api_sync_at: Option<String>,
    days: BTreeMap<String, CursorDay>,
}

/// One Claude API call after streaming-chunk dedup.
#[derive(Clone)]
struct ClaudeCall {
    date: String,
    hour: u32,
    model: String,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_creation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CursorDay {
    /// Total Tokens from Cursor CSV (includes cache read) — source of truth.
    tokens: u64,
    tokens_no_cache: u64,
    cost_usd: f64,
    request_count: u64,
    models: BTreeMap<String, ModelStat>,
    hour_counts: Vec<u64>,
}

#[derive(Default, Clone)]
struct DayAcc {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_creation: u64,
    cost: f64,
    requests: u64,
    models: BTreeMap<String, ModelStat>,
    hour_counts: [u64; 24],
    hour_weight: u64,
    hour_sum: u64,
}

fn claude_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".claude").join("projects"));
        dirs.push(home.join(".config").join("claude").join("projects"));
    }
    dirs
}

fn estimate_cost(
    model: &str,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_creation: u64,
) -> f64 {
    let m = model.to_ascii_lowercase();
    let (in_rate, out_rate, cache_read_rate, cache_write_rate) = if m.contains("opus") {
        (15.0, 75.0, 1.5, 18.75)
    } else if m.contains("haiku") {
        (0.80, 4.0, 0.08, 1.0)
    } else {
        (3.0, 15.0, 0.30, 3.75)
    };

    let mil = 1_000_000.0;
    (input as f64) / mil * in_rate
        + (output as f64) / mil * out_rate
        + (cache_read as f64) / mil * cache_read_rate
        + (cache_creation as f64) / mil * cache_write_rate
}

fn parse_local_datetime(raw: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.with_timezone(&Local))
}

fn cutoff_date(days: u32) -> NaiveDate {
    let today = Local::now().date_naive();
    let span = days.max(1).saturating_sub(1) as i64;
    today - Duration::days(span)
}

fn empty_day(date: String) -> DayBucket {
    DayBucket {
        date,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0.0,
        claude_tokens: 0,
        cursor_tokens: 0,
        cursor_tokens_no_cache: 0,
        claude_cost_usd: 0.0,
        cursor_cost_usd: 0.0,
        request_count: 0,
        favorite_model: None,
        models: Vec::new(),
        hour_counts: vec![0; 24],
        claude_hour_counts: vec![0; 24],
        cursor_hour_counts: vec![0; 24],
        avg_hour: None,
    }
}

fn empty_series(days: u32) -> BTreeMap<String, DayAcc> {
    let today = Local::now().date_naive();
    let start = cutoff_date(days);
    let mut map = BTreeMap::new();
    let mut d = start;
    while d <= today {
        map.insert(d.format("%Y-%m-%d").to_string(), DayAcc::default());
        d += Duration::days(1);
    }
    map
}

fn absorb_event(acc: &mut DayAcc, model: &str, input: u64, output: u64, cache_read: u64, cache_creation: u64, cost: f64, hour: u32) {
    acc.input += input;
    acc.output += output;
    acc.cache_read += cache_read;
    acc.cache_creation += cache_creation;
    acc.cost += cost;
    acc.requests += 1;
    let tokens = input + output + cache_read + cache_creation;
    let entry = acc.models.entry(model.to_string()).or_insert_with(|| ModelStat {
        model: model.to_string(),
        tokens: 0,
        requests: 0,
        cost_usd: 0.0,
        source: "claude".into(),
    });
    entry.tokens += tokens;
    entry.requests += 1;
    entry.cost_usd += cost;
    let h = (hour % 24) as usize;
    acc.hour_counts[h] += 1;
    acc.hour_weight += 1;
    acc.hour_sum += hour as u64 % 24;
}

fn finalize_day(date: String, acc: DayAcc, cursor: Option<&CursorDay>) -> DayBucket {
    let claude_hours = acc.hour_counts.to_vec();
    let mut models: Vec<ModelStat> = acc.models.into_values().collect();
    let mut hour_sum = acc.hour_sum;
    let mut hour_weight = acc.hour_weight;
    let mut hour_counts = acc.hour_counts;
    let mut cursor_hours = vec![0u64; 24];

    let claude_tokens = acc.input + acc.output + acc.cache_read + acc.cache_creation;
    let mut day = empty_day(date);
    day.input_tokens = acc.input;
    day.output_tokens = acc.output;
    day.cache_read_tokens = acc.cache_read;
    day.cache_creation_tokens = acc.cache_creation;
    day.claude_tokens = claude_tokens;
    day.claude_cost_usd = acc.cost;
    day.total_tokens = claude_tokens;
    day.estimated_cost_usd = acc.cost;
    day.request_count = acc.requests;

    if let Some(c) = cursor {
        day.cursor_tokens += c.tokens;
        day.cursor_tokens_no_cache += c.tokens_no_cache;
        day.cursor_cost_usd += c.cost_usd;
        day.total_tokens += c.tokens;
        day.estimated_cost_usd += c.cost_usd;
        day.request_count += c.request_count;
        for m in c.models.values() {
            models.push(m.clone());
        }
        if c.hour_counts.len() == 24 {
            cursor_hours = c.hour_counts.clone();
            for (i, &n) in c.hour_counts.iter().enumerate() {
                hour_counts[i] += n;
                hour_weight += n;
                hour_sum += (i as u64) * n;
            }
        }
    }

    models.sort_by(|a, b| b.tokens.cmp(&a.tokens));
    day.favorite_model = models.first().map(|m| m.model.clone());
    day.models = models;
    day.claude_hour_counts = claude_hours;
    day.cursor_hour_counts = cursor_hours;
    day.hour_counts = hour_counts.to_vec();
    day.avg_hour = if hour_weight > 0 {
        Some(hour_sum as f64 / hour_weight as f64)
    } else {
        None
    };
    day
}

/// Claude Code writes several JSONL lines per API call while streaming.
/// Same `message.id` / `requestId`; `output_tokens` grows; input/cache repeat.
/// Keep the snapshot with the largest `output_tokens` (final totals).
fn claude_call_key(value: &Value, message: &Value) -> String {
    let msg_id = message.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let req_id = value
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !msg_id.is_empty() || !req_id.is_empty() {
        return format!("{msg_id}|{req_id}");
    }
    // Fallback: unique per line (no dedup possible).
    value
        .get("uuid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn scan_jsonl_file(path: &Path, cutoff: NaiveDate, calls: &mut HashMap<String, ClaudeCall>) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let reader = BufReader::new(file);
    for line in reader.lines().flatten() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if value.get("type").and_then(|t| t.as_str()) != Some("assistant") {
            continue;
        }
        let Some(ts) = value.get("timestamp").and_then(|t| t.as_str()) else {
            continue;
        };
        let Some(dt) = parse_local_datetime(ts) else {
            continue;
        };
        let date = dt.date_naive();
        if date < cutoff {
            continue;
        }
        let message = match value.get("message") {
            Some(m) => m,
            None => continue,
        };
        let usage = match message.get("usage") {
            Some(u) => u,
            None => continue,
        };
        let input = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let cache_read = usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let cache_creation = usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if input + output + cache_read + cache_creation == 0 {
            continue;
        }
        let model = message
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or("claude-sonnet")
            .to_string();
        let key = claude_call_key(&value, message);
        if key.is_empty() {
            continue;
        }
        let next = ClaudeCall {
            date: date.format("%Y-%m-%d").to_string(),
            hour: dt.hour(),
            model,
            input,
            output,
            cache_read,
            cache_creation,
        };
        match calls.get(&key) {
            Some(prev) if next.output < prev.output => {}
            _ => {
                calls.insert(key, next);
            }
        }
    }
}

fn fold_claude_calls(calls: HashMap<String, ClaudeCall>, map: &mut BTreeMap<String, DayAcc>) {
    for call in calls.into_values() {
        let cost = estimate_cost(
            &call.model,
            call.input,
            call.output,
            call.cache_read,
            call.cache_creation,
        );
        let acc = map.entry(call.date).or_default();
        absorb_event(
            acc,
            &call.model,
            call.input,
            call.output,
            call.cache_read,
            call.cache_creation,
            cost,
            call.hour,
        );
    }
}

fn cursor_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("cursor-usage.json"))
}

fn load_cursor(app: &AppHandle) -> PersistedCursor {
    let Ok(path) = cursor_store_path(app) else {
        return PersistedCursor::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return PersistedCursor::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn parse_f64(raw: &str) -> f64 {
    let cleaned = raw
        .trim()
        .trim_matches('"')
        .replace('$', "")
        .replace(',', "");
    if cleaned.eq_ignore_ascii_case("included")
        || cleaned.eq_ignore_ascii_case("free")
        || cleaned.is_empty()
    {
        return 0.0;
    }
    cleaned.parse().unwrap_or(0.0)
}

fn parse_u64(raw: &str) -> u64 {
    let cleaned = raw.trim().trim_matches('"').replace(',', "");
    cleaned.parse().unwrap_or(0)
}

fn extract_date(raw: &str) -> Option<String> {
    let s = raw.trim().trim_matches('"');
    // Prefer full timestamp → local calendar day (CSV dates are UTC).
    if let Some(dt) = parse_local_datetime(s) {
        return Some(dt.date_naive().format("%Y-%m-%d").to_string());
    }
    if s.len() >= 10 {
        let candidate = &s[..10];
        if NaiveDate::parse_from_str(candidate, "%Y-%m-%d").is_ok() {
            return Some(candidate.to_string());
        }
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%m/%d/%Y") {
        return Some(d.format("%Y-%m-%d").to_string());
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%m/%Y") {
        return Some(d.format("%Y-%m-%d").to_string());
    }
    None
}

fn normalize_header(h: &str) -> String {
    h.to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

/// Prefer exact header matches, then long substring matches.
/// Avoids "tokens" matching "Output Tokens" before "Total Tokens".
fn find_col(headers: &[String], candidates: &[&str]) -> Option<usize> {
    let norms: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();

    for c in candidates {
        let c = normalize_header(c);
        if let Some(i) = norms.iter().position(|h| h == &c) {
            return Some(i);
        }
    }
    for c in candidates {
        let c = normalize_header(c);
        if c.len() < 6 {
            continue;
        }
        if let Some(i) = norms.iter().position(|h| h.contains(&c)) {
            return Some(i);
        }
    }
    None
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for ch in line.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                out.push(cur.trim().to_string());
                cur.clear();
            }
            _ => cur.push(ch),
        }
    }
    out.push(cur.trim().to_string());
    out
}

pub fn import_cursor_csv_content(
    content: &str,
    app: &AppHandle,
    source_path: Option<String>,
    from_api: bool,
) -> Result<CursorImportResult, String> {
    let mut lines = content.lines().filter(|l| !l.trim().is_empty());
    let header_line = lines.next().ok_or("CSV vide")?;
    let headers = parse_csv_line(header_line);

    let date_idx = find_col(
        &headers,
        &[
            "date",
            "timestamp",
            "createdat",
            "created",
            "time",
            "datetime",
        ],
    )
    .ok_or("Colonne date introuvable dans le CSV")?;

    // Prefer Total Tokens (Cursor export). Never match bare "tokens" first —
    // that wrongly picks "Output Tokens".
    let tokens_idx = find_col(
        &headers,
        &[
            "totaltokens",
            "total_tokens",
            "tokenusage",
            "tokencount",
        ],
    );
    let input_wo_cache_idx = find_col(
        &headers,
        &["inputwocachewrite", "inputwithoutcache", "inputwocache"],
    );
    let input_w_cache_idx = find_col(
        &headers,
        &["inputwcachewrite", "inputwithcachewrite", "cachewrite"],
    );
    let cache_read_idx = find_col(&headers, &["cacheread", "cache_read"]);
    let output_idx = find_col(&headers, &["outputtokens", "output_tokens", "output"]);
    let model_idx = find_col(&headers, &["model", "modelname"]);
    // Prefer what you actually pay when both columns exist.
    let cost_idx = find_col(
        &headers,
        &[
            "costtoyou",
            "cost_to_you",
            "cost",
            "charged",
            "amount",
            "totalcost",
            "costusd",
            "price",
        ],
    );

    let mut days: BTreeMap<String, CursorDay> = BTreeMap::new();
    let mut row_count = 0u64;

    for line in lines {
        let cols = parse_csv_line(line);
        if cols.len() <= date_idx {
            continue;
        }
        let raw_date = &cols[date_idx];
        let Some(date) = extract_date(raw_date) else {
            continue;
        };

        let input_wo = input_wo_cache_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_u64(v))
            .unwrap_or(0);
        let input_w = input_w_cache_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_u64(v))
            .unwrap_or(0);
        let cache_read = cache_read_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_u64(v))
            .unwrap_or(0);
        let output = output_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_u64(v))
            .unwrap_or(0);
        let tokens_no_cache = input_wo + input_w + output;
        // ALWAYS prefer CSV "Total Tokens" — this is what Cursor reports.
        let mut tokens = tokens_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_u64(v))
            .unwrap_or(0);
        if tokens == 0 {
            tokens = tokens_no_cache + cache_read;
        }

        let cost = cost_idx
            .and_then(|i| cols.get(i))
            .map(|v| parse_f64(v))
            .unwrap_or(0.0);

        let model = model_idx
            .and_then(|i| cols.get(i))
            .map(|s| s.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unknown".into());

        let hour = parse_local_datetime(raw_date.trim().trim_matches('"'))
            .map(|dt| dt.hour() as usize)
            .unwrap_or(12);

        let entry = days.entry(date).or_default();
        if entry.hour_counts.len() != 24 {
            entry.hour_counts = vec![0; 24];
        }
        entry.tokens += tokens;
        entry.tokens_no_cache += tokens_no_cache;
        entry.cost_usd += cost;
        entry.request_count += 1;
        entry.hour_counts[hour % 24] += 1;
        let m = entry.models.entry(model.clone()).or_insert_with(|| ModelStat {
            model: model.clone(),
            tokens: 0,
            requests: 0,
            cost_usd: 0.0,
            source: "cursor".into(),
        });
        m.tokens += tokens;
        m.requests += 1;
        m.cost_usd += cost;
        row_count += 1;
    }

    if row_count == 0 {
        return Err("Aucune ligne utilisable trouvée dans le CSV".into());
    }

    let imported_at = Local::now().to_rfc3339();
    let day_count = days.len() as u64;
    let total_tokens = days.values().map(|d| d.tokens).sum();
    let today = crate::cursor_sync::today_local();
    let previous = load_cursor(app);

    let persisted = PersistedCursor {
        imported_at: imported_at.clone(),
        source_path: source_path.clone(),
        last_api_sync_day: if from_api {
            Some(today)
        } else {
            previous.last_api_sync_day
        },
        last_api_sync_at: if from_api {
            Some(imported_at.clone())
        } else {
            previous.last_api_sync_at
        },
        days,
    };
    let path = cursor_store_path(app)?;
    let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::write(dir.join("cursor-last-import.csv"), content);
        if from_api {
            crate::cursor_sync::cache_csv(&dir, content);
        }
    }

    Ok(CursorImportResult {
        imported_at,
        row_count,
        day_count,
        total_tokens,
        source_path,
    })
}

fn downloads_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Downloads"));
        dirs.push(home.join("Téléchargements"));
        dirs.push(home.join("OneDrive").join("Downloads"));
    }
    dirs
}

fn looks_like_usage_csv(path: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Some(header) = raw.lines().next() else {
        return false;
    };
    let lower = header.to_ascii_lowercase();
    let has_date = lower.contains("date") || lower.contains("timestamp") || lower.contains("created");
    let has_usage = lower.contains("token")
        || lower.contains("cost")
        || lower.contains("model")
        || lower.contains("usage")
        || lower.contains("request");
    has_date && has_usage
}

fn score_csv_candidate(path: &Path) -> i64 {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut score = 0i64;
    if name.contains("usage") {
        score += 50;
    }
    if name.contains("cursor") {
        score += 40;
    }
    if name.contains("export") {
        score += 20;
    }
    if let Ok(meta) = fs::metadata(path) {
        if let Ok(modified) = meta.modified() {
            if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                // prefer recent files
                score += 10_000i64.saturating_sub(elapsed.as_secs() as i64 / 60);
            }
        }
    }
    score
}

pub fn find_and_import_cursor_csv(app: &AppHandle) -> Result<Option<CursorImportResult>, String> {
    let mut candidates: Vec<(i64, PathBuf)> = Vec::new();
    for dir in downloads_dirs() {
        if !dir.exists() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("csv")) != Some(true)
            {
                continue;
            }
            if !looks_like_usage_csv(&path) {
                continue;
            }
            candidates.push((score_csv_candidate(&path), path));
        }
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    let Some((_, best)) = candidates.into_iter().next() else {
        return Ok(None);
    };
    let content = fs::read_to_string(&best).map_err(|e| e.to_string())?;
    let result =
        import_cursor_csv_content(&content, app, Some(best.display().to_string()), false)?;
    Ok(Some(result))
}

fn cursor_sync_is_fresh(existing: &PersistedCursor) -> bool {
    if existing.days.is_empty() {
        return false;
    }
    let Some(raw) = existing.last_api_sync_at.as_deref() else {
        // Legacy: only day marker — treat as stale so we refresh once.
        return false;
    };
    let Some(dt) = parse_local_datetime(raw) else {
        return false;
    };
    let age = Local::now() - dt;
    age < Duration::hours(2)
}

/// Sync Cursor usage from cursor.com (at most every ~2h unless forced).
/// Falls back to a Downloads CSV if the API is unavailable.
pub fn ensure_cursor_usage(
    app: &AppHandle,
    force: bool,
) -> Result<Option<CursorImportResult>, String> {
    let existing = load_cursor(app);

    if !force && cursor_sync_is_fresh(&existing) {
        return Ok(None);
    }

    match crate::cursor_sync::fetch_usage_csv() {
        Ok(csv) => {
            let result = import_cursor_csv_content(
                &csv,
                app,
                Some("cursor.com (sync auto)".into()),
                true,
            )?;
            Ok(Some(result))
        }
        Err(api_err) => {
            // Soft fallback: Downloads CSV if we have nothing (or forced).
            if force || existing.days.is_empty() {
                match find_and_import_cursor_csv(app)? {
                    Some(r) => Ok(Some(r)),
                    None => Err(api_err),
                }
            } else {
                Ok(None)
            }
        }
    }
}

pub fn load_merged_usage(days: u32, app: &AppHandle) -> Result<MergedUsageResponse, String> {
    // Cursor: pull billed usage CSV from cursor.com (session token).
    let _ = ensure_cursor_usage(app, false);

    let mut map = empty_series(days);
    let cutoff = cutoff_date(days);

    // Claude: dedupe streaming JSONL chunks across all session files first.
    let mut claude_calls: HashMap<String, ClaudeCall> = HashMap::new();
    for root in claude_dirs() {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            scan_jsonl_file(path, cutoff, &mut claude_calls);
        }
    }
    fold_claude_calls(claude_calls, &mut map);

    let cursor = load_cursor(app);
    let mut days_out = Vec::new();
    for (date, acc) in map {
        let cday = cursor.days.get(&date);
        if let Ok(d) = NaiveDate::parse_from_str(&date, "%Y-%m-%d") {
            if d < cutoff && cday.is_none() && acc.requests == 0 {
                continue;
            }
        }
        days_out.push(finalize_day(date, acc, cday));
    }
    days_out.sort_by(|a, b| a.date.cmp(&b.date));

    let cursor_day_count = cursor
        .days
        .keys()
        .filter(|date| {
            NaiveDate::parse_from_str(date, "%Y-%m-%d")
                .map(|d| d >= cutoff)
                .unwrap_or(false)
        })
        .count() as u64;

    Ok(MergedUsageResponse {
        days: days_out,
        cursor_imported_at: if cursor.imported_at.is_empty() {
            None
        } else {
            Some(cursor.imported_at)
        },
        cursor_day_count,
        cursor_auto_path: cursor.source_path.clone(),
    })
}
