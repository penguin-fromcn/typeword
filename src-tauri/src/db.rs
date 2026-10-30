use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordState {
    pub weight: f64,
    pub stability_days: f64,
    pub interval_days: f64,
    pub ease_factor: f64,
    pub repetitions: i64,
    pub consecutive_correct: i64,
    pub attempt_count: i64,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub hint_count: i64,
    pub last_reviewed_at: Option<i64>,
    pub last_result: Option<String>,
    pub next_review_at: i64,
}

pub fn initial_state(now: i64) -> WordState {
    WordState {
        weight: 3.0,
        stability_days: 0.25,
        interval_days: 0.0,
        ease_factor: 2.5,
        repetitions: 0,
        consecutive_correct: 0,
        attempt_count: 0,
        correct_count: 0,
        wrong_count: 0,
        hint_count: 0,
        last_reviewed_at: None,
        last_result: None,
        next_review_at: now,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub id: String,
    pub word: String,
    pub normalized_word: String,
    pub meanings: Vec<String>,
    pub accepted_answers: Vec<String>,
    pub phonetic: Option<String>,
    pub example_sentence: Option<String>,
    pub notes: Option<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub difficulty: i64,
    pub weight: f64,
    pub stability_days: f64,
    pub interval_days: f64,
    pub ease_factor: f64,
    pub repetitions: i64,
    pub consecutive_correct: i64,
    pub attempt_count: i64,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub hint_count: i64,
    pub last_result: Option<String>,
    pub last_reviewed_at: Option<i64>,
    pub next_review_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub enabled: bool,
    pub study_enabled: bool,
    pub group_id: Option<String>,
    pub mark: String,
    pub dictation_enabled: bool,
    pub dictation_state: WordState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordGroup {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLog {
    pub id: String,
    pub word_id: String,
    pub result: String,
    pub hint_used: bool,
    pub answer_text: String,
    pub expected_answer: String,
    pub weight_before: f64,
    pub weight_after: f64,
    pub interval_before: f64,
    pub interval_after: f64,
    pub reviewed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub inserted: i64,
    pub updated: i64,
    pub skipped: i64,
}

const WORD_COLUMNS: &str = "id, word, normalized_word, meanings, accepted_answers, phonetic, \
example_sentence, notes, category, tags, difficulty, weight, stability_days, interval_days, \
ease_factor, repetitions, consecutive_correct, attempt_count, correct_count, wrong_count, \
hint_count, last_result, last_reviewed_at, next_review_at, created_at, updated_at, enabled, \
group_id, study_enabled, mark, dictation_enabled, dictation_state";

const REVIEW_RESULTS: [&str; 4] = ["correct", "correct_with_hint", "wrong", "skipped"];

fn json_list(value: String, column: usize) -> rusqlite::Result<Vec<String>> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, rusqlite::types::Type::Text, Box::new(error))
    })
}

fn state_to_json(state: &WordState) -> String {
    serde_json::to_string(state).unwrap_or_else(|_| "{}".to_string())
}

fn normalize_state(state: WordState, fallback_at: i64) -> WordState {
    let last_result = match state.last_result.as_deref() {
        Some(value) if REVIEW_RESULTS.contains(&value) => Some(value.to_string()),
        Some(_) => None,
        None => None,
    };
    WordState {
        weight: state.weight.clamp(0.25, 8.0),
        stability_days: state.stability_days.max(0.05),
        interval_days: state.interval_days.max(0.0),
        ease_factor: state.ease_factor.clamp(1.3, 2.8),
        repetitions: state.repetitions.max(0),
        consecutive_correct: state.consecutive_correct.max(0),
        attempt_count: state.attempt_count.max(0),
        correct_count: state.correct_count.max(0),
        wrong_count: state.wrong_count.max(0),
        hint_count: state.hint_count.max(0),
        last_reviewed_at: state.last_reviewed_at,
        last_result,
        next_review_at: if state.next_review_at > 0 {
            state.next_review_at
        } else {
            fallback_at
        },
    }
}

/// 旧库或旧备份没有听写状态时，按独立的新词状态补齐。
fn state_from_column(value: Option<String>, fallback_at: i64) -> WordState {
    value
        .filter(|text| !text.trim().is_empty())
        .and_then(|text| serde_json::from_str::<WordState>(&text).ok())
        .map(|state| normalize_state(state, fallback_at))
        .unwrap_or_else(|| initial_state(fallback_at))
}

fn word_from_row(row: &Row<'_>) -> rusqlite::Result<Word> {
    let next_review_at: i64 = row.get(23)?;
    Ok(Word {
        id: row.get(0)?,
        word: row.get(1)?,
        normalized_word: row.get(2)?,
        meanings: json_list(row.get(3)?, 3)?,
        accepted_answers: json_list(row.get(4)?, 4)?,
        phonetic: row.get(5)?,
        example_sentence: row.get(6)?,
        notes: row.get(7)?,
        category: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        tags: json_list(row.get(9)?, 9)?,
        difficulty: row.get(10)?,
        weight: row.get(11)?,
        stability_days: row.get(12)?,
        interval_days: row.get(13)?,
        ease_factor: row.get(14)?,
        repetitions: row.get(15)?,
        consecutive_correct: row.get(16)?,
        attempt_count: row.get(17)?,
        correct_count: row.get(18)?,
        wrong_count: row.get(19)?,
        hint_count: row.get(20)?,
        last_result: row.get(21)?,
        last_reviewed_at: row.get(22)?,
        next_review_at,
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
        enabled: row.get::<_, i64>(26)? != 0,
        group_id: row.get(27)?,
        study_enabled: row.get::<_, i64>(28)? != 0,
        mark: row
            .get::<_, Option<String>>(29)?
            .unwrap_or_else(|| "none".to_string()),
        dictation_enabled: row.get::<_, i64>(30)? != 0,
        dictation_state: state_from_column(row.get(31)?, next_review_at),
    })
}

fn log_from_row(row: &Row<'_>) -> rusqlite::Result<ReviewLog> {
    Ok(ReviewLog {
        id: row.get(0)?,
        word_id: row.get(1)?,
        result: row.get(2)?,
        hint_used: row.get::<_, i64>(3)? != 0,
        answer_text: row.get(4)?,
        expected_answer: row.get(5)?,
        weight_before: row.get(6)?,
        weight_after: row.get(7)?,
        interval_before: row.get(8)?,
        interval_after: row.get(9)?,
        reviewed_at: row.get(10)?,
    })
}

fn to_json_list(values: &[String]) -> String {
    serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn has_attached_column(
    conn: &Connection,
    schema: &str,
    table: &str,
    column: &str,
) -> rusqlite::Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA {schema}.table_info({table})"))?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn attached_table_exists(conn: &Connection, schema: &str, table: &str) -> rusqlite::Result<bool> {
    let found: Option<i64> = conn
        .query_row(
            &format!(
                "SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = ?1"
            ),
            params![table],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(include_str!("../migrations/001_initial.sql"))?;
    conn.execute_batch(include_str!("../migrations/002_word_groups.sql"))?;

    if !has_column(conn, "words", "enabled")? {
        conn.execute_batch("ALTER TABLE words ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;")?;
    }
    if !has_column(conn, "words", "group_id")? {
        conn.execute_batch(
            "ALTER TABLE words ADD COLUMN group_id TEXT REFERENCES word_groups(id) ON DELETE SET NULL;",
        )?;
    }
    if !has_column(conn, "words", "study_enabled")? {
        conn.execute_batch(
            "ALTER TABLE words ADD COLUMN study_enabled INTEGER NOT NULL DEFAULT 1;",
        )?;
    }
    if !has_column(conn, "words", "mark")? {
        conn.execute_batch("ALTER TABLE words ADD COLUMN mark TEXT NOT NULL DEFAULT 'none';")?;
    }
    if !has_column(conn, "words", "dictation_enabled")? {
        conn.execute_batch(
            "ALTER TABLE words ADD COLUMN dictation_enabled INTEGER NOT NULL DEFAULT 1;
             UPDATE words SET dictation_enabled = enabled;",
        )?;
    }
    if !has_column(conn, "words", "dictation_state")? {
        conn.execute_batch("ALTER TABLE words ADD COLUMN dictation_state TEXT;")?;
    }
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_words_enabled ON words(enabled);
         CREATE INDEX IF NOT EXISTS idx_words_group_id ON words(group_id);
         CREATE INDEX IF NOT EXISTS idx_words_study_enabled ON words(study_enabled);
         CREATE INDEX IF NOT EXISTS idx_words_dictation_enabled ON words(dictation_enabled);
         CREATE INDEX IF NOT EXISTS idx_words_mark ON words(mark);",
    )?;
    Ok(())
}

pub fn open_database(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|error| error.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| error.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    init_schema(&conn).map_err(|error| error.to_string())?;
    Ok(conn)
}

pub fn list_words(conn: &Connection) -> rusqlite::Result<Vec<Word>> {
    let sql = format!("SELECT {WORD_COLUMNS} FROM words ORDER BY created_at ASC, id ASC");
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map([], word_from_row)?;
    rows.collect()
}

pub fn get_word(conn: &Connection, id: &str) -> rusqlite::Result<Option<Word>> {
    let sql = format!("SELECT {WORD_COLUMNS} FROM words WHERE id = ?1");
    conn.query_row(&sql, params![id], word_from_row).optional()
}

pub fn insert_word(conn: &Connection, word: &Word) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO words (
            id, word, normalized_word, meanings, accepted_answers, phonetic, example_sentence,
            notes, category, tags, difficulty, weight, stability_days, interval_days, ease_factor,
            repetitions, consecutive_correct, attempt_count, correct_count, wrong_count, hint_count,
            last_result, last_reviewed_at, next_review_at, created_at, updated_at, enabled, group_id,
            study_enabled, mark, dictation_enabled, dictation_state
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
            ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32
        )",
        params![
            word.id,
            word.word,
            word.normalized_word,
            to_json_list(&word.meanings),
            to_json_list(&word.accepted_answers),
            word.phonetic,
            word.example_sentence,
            word.notes,
            word.category,
            to_json_list(&word.tags),
            word.difficulty,
            word.weight,
            word.stability_days,
            word.interval_days,
            word.ease_factor,
            word.repetitions,
            word.consecutive_correct,
            word.attempt_count,
            word.correct_count,
            word.wrong_count,
            word.hint_count,
            word.last_result,
            word.last_reviewed_at,
            word.next_review_at,
            word.created_at,
            word.updated_at,
            if word.enabled { 1 } else { 0 },
            word.group_id,
            if word.study_enabled { 1 } else { 0 },
            word.mark,
            if word.dictation_enabled { 1 } else { 0 },
            state_to_json(&word.dictation_state),
        ],
    )?;
    Ok(())
}

pub fn update_word(conn: &Connection, word: &Word) -> rusqlite::Result<()> {
    let changed = conn.execute(
        "UPDATE words SET
            word = ?2,
            normalized_word = ?3,
            meanings = ?4,
            accepted_answers = ?5,
            phonetic = ?6,
            example_sentence = ?7,
            notes = ?8,
            category = ?9,
            tags = ?10,
            difficulty = ?11,
            weight = ?12,
            stability_days = ?13,
            interval_days = ?14,
            ease_factor = ?15,
            repetitions = ?16,
            consecutive_correct = ?17,
            attempt_count = ?18,
            correct_count = ?19,
            wrong_count = ?20,
            hint_count = ?21,
            last_result = ?22,
            last_reviewed_at = ?23,
            next_review_at = ?24,
            updated_at = ?25,
            enabled = ?26,
            group_id = ?27,
            study_enabled = ?28,
            mark = ?29,
            dictation_enabled = ?30,
            dictation_state = ?31
        WHERE id = ?1",
        params![
            word.id,
            word.word,
            word.normalized_word,
            to_json_list(&word.meanings),
            to_json_list(&word.accepted_answers),
            word.phonetic,
            word.example_sentence,
            word.notes,
            word.category,
            to_json_list(&word.tags),
            word.difficulty,
            word.weight,
            word.stability_days,
            word.interval_days,
            word.ease_factor,
            word.repetitions,
            word.consecutive_correct,
            word.attempt_count,
            word.correct_count,
            word.wrong_count,
            word.hint_count,
            word.last_result,
            word.last_reviewed_at,
            word.next_review_at,
            word.updated_at,
            if word.enabled { 1 } else { 0 },
            word.group_id,
            if word.study_enabled { 1 } else { 0 },
            word.mark,
            if word.dictation_enabled { 1 } else { 0 },
            state_to_json(&word.dictation_state),
        ],
    )?;

    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn delete_word(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM words WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_word_mark(conn: &Connection, id: &str, mark: &str, now: i64) -> rusqlite::Result<()> {
    let changed = conn.execute(
        "UPDATE words SET mark = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, mark, now],
    )?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn set_words_flag(
    conn: &Connection,
    ids: &[String],
    column: &str,
    enabled: bool,
) -> rusqlite::Result<()> {
    debug_assert!(matches!(column, "enabled" | "study_enabled" | "dictation_enabled"));
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("UPDATE words SET {column} = ? WHERE id IN ({placeholders})");
    let flag = if enabled { 1 } else { 0 };
    let mut values: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(ids.len() + 1);
    values.push(&flag);
    for id in ids {
        values.push(id);
    }
    conn.execute(&sql, values.as_slice())?;
    Ok(())
}

pub fn set_words_enabled(conn: &Connection, ids: &[String], enabled: bool) -> rusqlite::Result<()> {
    set_words_flag(conn, ids, "enabled", enabled)
}

pub fn set_words_study_enabled(
    conn: &Connection,
    ids: &[String],
    enabled: bool,
) -> rusqlite::Result<()> {
    set_words_flag(conn, ids, "study_enabled", enabled)
}

pub fn set_words_dictation_enabled(
    conn: &Connection,
    ids: &[String],
    enabled: bool,
) -> rusqlite::Result<()> {
    set_words_flag(conn, ids, "dictation_enabled", enabled)
}

/// 弹窗保存时一次性对齐整份选择，避免两次独立写入造成部分成功。
pub fn set_study_selection(
    conn: &mut Connection,
    enable_ids: &[String],
    disable_ids: &[String],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    set_words_flag(&tx, enable_ids, "study_enabled", true)?;
    set_words_flag(&tx, disable_ids, "study_enabled", false)?;
    tx.commit()?;
    Ok(())
}

pub fn set_words_group(
    conn: &Connection,
    ids: &[String],
    group_id: Option<&str>,
    now: i64,
) -> rusqlite::Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; ids.len()].join(", ");
    let sql = format!("UPDATE words SET group_id = ?, updated_at = ? WHERE id IN ({placeholders})");
    let mut values: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(ids.len() + 2);
    values.push(&group_id);
    values.push(&now);
    for id in ids {
        values.push(id);
    }
    conn.execute(&sql, values.as_slice())?;
    Ok(())
}

fn group_from_row(row: &Row<'_>) -> rusqlite::Result<WordGroup> {
    Ok(WordGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        enabled: row.get::<_, i64>(2)? != 0,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn list_groups(conn: &Connection) -> rusqlite::Result<Vec<WordGroup>> {
    let mut statement = conn.prepare(
        "SELECT id, name, enabled, created_at, updated_at
        FROM word_groups ORDER BY created_at ASC, id ASC",
    )?;
    let rows = statement.query_map([], group_from_row)?;
    rows.collect()
}

pub fn insert_group(conn: &Connection, group: &WordGroup) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO word_groups (id, name, enabled, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            group.id,
            group.name,
            if group.enabled { 1 } else { 0 },
            group.created_at,
            group.updated_at,
        ],
    )?;
    Ok(())
}

pub fn update_group(conn: &Connection, group: &WordGroup) -> rusqlite::Result<()> {
    let changed = conn.execute(
        "UPDATE word_groups SET name = ?2, enabled = ?3, updated_at = ?4 WHERE id = ?1",
        params![
            group.id,
            group.name,
            if group.enabled { 1 } else { 0 },
            group.updated_at,
        ],
    )?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn delete_group(conn: &mut Connection, id: &str) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE words SET group_id = NULL WHERE group_id = ?1", params![id])?;
    let changed = tx.execute("DELETE FROM word_groups WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    tx.commit()?;
    Ok(())
}

pub fn insert_review_log(conn: &Connection, log: &ReviewLog) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO review_logs (
            id, word_id, result, hint_used, answer_text, expected_answer, weight_before,
            weight_after, interval_before, interval_after, reviewed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            log.id,
            log.word_id,
            log.result,
            if log.hint_used { 1 } else { 0 },
            log.answer_text,
            log.expected_answer,
            log.weight_before,
            log.weight_after,
            log.interval_before,
            log.interval_after,
            log.reviewed_at,
        ],
    )?;
    Ok(())
}

/// 单词状态更新与复习日志写入必须处于同一事务中。
pub fn apply_review(conn: &mut Connection, word: &Word, log: &ReviewLog) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    update_word(&tx, word)?;
    insert_review_log(&tx, log)?;
    tx.commit()?;
    Ok(())
}

/// 撤销一次误判：删除原日志、恢复作答前的单词状态，并写入跳过记录。
pub fn undo_review(
    conn: &mut Connection,
    log_id: &str,
    restored_word: &Word,
    skip_log: &ReviewLog,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let removed = tx.execute("DELETE FROM review_logs WHERE id = ?1", params![log_id])?;
    if removed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    update_word(&tx, restored_word)?;
    insert_review_log(&tx, skip_log)?;
    tx.commit()?;
    Ok(())
}

pub fn list_review_logs(conn: &Connection, since: Option<i64>) -> rusqlite::Result<Vec<ReviewLog>> {
    let mut statement = conn.prepare(
        "SELECT id, word_id, result, hint_used, answer_text, expected_answer, weight_before,
            weight_after, interval_before, interval_after, reviewed_at
        FROM review_logs
        WHERE (?1 IS NULL OR reviewed_at >= ?1)
        ORDER BY reviewed_at ASC, id ASC",
    )?;
    let rows = statement.query_map(params![since], log_from_row)?;
    rows.collect()
}

pub fn get_settings(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
    let mut statement = conn.prepare("SELECT key, value FROM settings")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    let mut result = HashMap::new();
    for row in rows {
        let (key, value) = row?;
        result.insert(key, value);
    }
    Ok(result)
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str, now: i64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )?;
    Ok(())
}

fn existing_id_by_normalized(conn: &Connection, normalized: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT id FROM words WHERE normalized_word = ?1",
        params![normalized],
        |row| row.get(0),
    )
    .optional()
}

fn import_words_inner(
    conn: &Connection,
    words: &[Word],
    replace_state: bool,
) -> rusqlite::Result<ImportOutcome> {
    let mut outcome = ImportOutcome {
        inserted: 0,
        updated: 0,
        skipped: 0,
    };

    for word in words {
        match existing_id_by_normalized(conn, &word.normalized_word)? {
            Some(existing_id) => {
                if replace_state {
                    let existing = get_word(conn, &existing_id)?;
                    let mut merged = word.clone();
                    merged.id = existing_id;
                    if let Some(existing) = existing {
                        merged.created_at = existing.created_at;
                        merged.enabled = existing.enabled;
                        merged.study_enabled = existing.study_enabled;
                        merged.group_id = existing.group_id;
                        merged.mark = existing.mark;
                        merged.dictation_enabled = existing.dictation_enabled;
                        merged.dictation_state = existing.dictation_state;
                    }
                    update_word(conn, &merged)?;
                    outcome.updated += 1;
                } else {
                    outcome.skipped += 1;
                }
            }
            None => {
                insert_word(conn, word)?;
                outcome.inserted += 1;
            }
        }
    }

    Ok(outcome)
}

pub fn import_words(
    conn: &mut Connection,
    words: &[Word],
    replace_state: bool,
) -> rusqlite::Result<ImportOutcome> {
    let tx = conn.transaction()?;
    let outcome = import_words_inner(&tx, words, replace_state)?;
    tx.commit()?;
    Ok(outcome)
}

/// 首次种子导入：同一事务内写词并记录 seed_imported，之后永不自动重复。
pub fn seed_import(conn: &mut Connection, words: &[Word], now: i64) -> rusqlite::Result<ImportOutcome> {
    let tx = conn.transaction()?;
    let already_imported = get_setting(&tx, "seed_imported")?
        .map(|value| value == "true")
        .unwrap_or(false);

    if already_imported {
        return Ok(ImportOutcome {
            inserted: 0,
            updated: 0,
            skipped: words.len() as i64,
        });
    }

    let outcome = import_words_inner(&tx, words, false)?;
    set_setting(&tx, "seed_imported", "true", now)?;
    tx.commit()?;
    Ok(outcome)
}

pub fn restore_seed(conn: &mut Connection, words: &[Word], now: i64) -> rusqlite::Result<ImportOutcome> {
    let tx = conn.transaction()?;
    let outcome = import_words_inner(&tx, words, false)?;
    set_setting(&tx, "seed_imported", "true", now)?;
    tx.commit()?;
    Ok(outcome)
}

pub fn reset_progress(conn: &mut Connection, now: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let initial_json = state_to_json(&initial_state(now));
    tx.execute(
        "UPDATE words SET
            weight = 3.0,
            stability_days = 0.25,
            interval_days = 0,
            ease_factor = 2.5,
            repetitions = 0,
            consecutive_correct = 0,
            attempt_count = 0,
            correct_count = 0,
            wrong_count = 0,
            hint_count = 0,
            last_result = NULL,
            last_reviewed_at = NULL,
            next_review_at = ?1,
            dictation_state = ?2,
            updated_at = ?1",
        params![now, initial_json],
    )?;
    tx.execute("DELETE FROM review_logs", [])?;
    tx.commit()?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub created_at: i64,
    pub size: i64,
}

const BACKUP_PREFIX: &str = "typeword-backup-";
const BACKUP_SUFFIX: &str = ".sqlite3";
const MAX_DAILY_BACKUPS: usize = 12;

fn sanitize_day_key(day_key: &str) -> Result<String, String> {
    let cleaned: String = day_key
        .chars()
        .filter(|value| value.is_ascii_digit() || *value == '-')
        .collect();
    let valid = cleaned.len() == 10
        && cleaned.as_bytes()[4] == b'-'
        && cleaned.as_bytes()[7] == b'-';
    if !valid {
        return Err("备份日期格式无效".to_string());
    }
    Ok(cleaned)
}

pub fn is_backup_file_name(name: &str) -> bool {
    name.starts_with(BACKUP_PREFIX)
        && name.ends_with(BACKUP_SUFFIX)
        && !name.contains(['/', '\\'])
}

fn is_daily_backup(name: &str) -> bool {
    let Some(middle) = name
        .strip_prefix(BACKUP_PREFIX)
        .and_then(|rest| rest.strip_suffix(BACKUP_SUFFIX))
    else {
        return false;
    };
    middle.len() == 10
        && middle.as_bytes()[4] == b'-'
        && middle.as_bytes()[7] == b'-'
        && middle
            .bytes()
            .enumerate()
            .all(|(index, value)| index == 4 || index == 7 || value.is_ascii_digit())
}

fn backup_info(path: &Path) -> Result<BackupInfo, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let created_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    Ok(BackupInfo {
        file_name: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        created_at,
        size: metadata.len() as i64,
    })
}

fn create_snapshot(conn: &Connection, path: &Path) -> Result<BackupInfo, String> {
    let target = path.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", params![target])
        .map_err(|error| error.to_string())?;
    backup_info(path)
}

fn prune_daily_backups(dir: &Path) -> Result<(), String> {
    let mut dailies: Vec<BackupInfo> = list_backups(dir)?
        .into_iter()
        .filter(|backup| is_daily_backup(&backup.file_name))
        .collect();
    if dailies.len() <= MAX_DAILY_BACKUPS {
        return Ok(());
    }
    dailies.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then(left.file_name.cmp(&right.file_name))
    });
    let remove_count = dailies.len() - MAX_DAILY_BACKUPS;
    for backup in dailies.into_iter().take(remove_count) {
        let _ = std::fs::remove_file(dir.join(&backup.file_name));
    }
    Ok(())
}

/// 每日备份按日期命名，同一天重复调用直接复用已有快照。
pub fn create_backup(
    conn: &Connection,
    dir: &Path,
    day_key: &str,
    now: i64,
    manual: bool,
) -> Result<BackupInfo, String> {
    let day_key = sanitize_day_key(day_key)?;
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let file_name = if manual {
        format!("{BACKUP_PREFIX}{day_key}-{now}{BACKUP_SUFFIX}")
    } else {
        format!("{BACKUP_PREFIX}{day_key}{BACKUP_SUFFIX}")
    };
    let path = dir.join(&file_name);
    let info = if path.exists() {
        backup_info(&path)?
    } else {
        create_snapshot(conn, &path)?
    };
    if let Err(error) = prune_daily_backups(dir) {
        eprintln!("清理旧备份失败：{error}");
    }
    Ok(info)
}

pub fn list_backups(dir: &Path) -> Result<Vec<BackupInfo>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_backup_file_name(&name) {
            continue;
        }
        if let Ok(info) = backup_info(&entry.path()) {
            items.push(info);
        }
    }
    items.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then(right.file_name.cmp(&left.file_name))
    });
    Ok(items)
}

fn copy_word_select_sql(conn: &Connection) -> rusqlite::Result<String> {
    let enabled = if has_attached_column(conn, "backup_db", "words", "enabled")? {
        "enabled"
    } else {
        "1"
    };
    let group_id = if has_attached_column(conn, "backup_db", "words", "group_id")? {
        "group_id"
    } else {
        "NULL"
    };
    let study_enabled = if has_attached_column(conn, "backup_db", "words", "study_enabled")? {
        "study_enabled"
    } else {
        "1"
    };
    let mark = if has_attached_column(conn, "backup_db", "words", "mark")? {
        "mark"
    } else {
        "'none'"
    };
    let dictation_enabled = if has_attached_column(conn, "backup_db", "words", "dictation_enabled")? {
        "dictation_enabled"
    } else {
        enabled
    };
    let dictation_state = if has_attached_column(conn, "backup_db", "words", "dictation_state")? {
        "dictation_state"
    } else {
        "NULL"
    };
    Ok(format!(
        "INSERT INTO words ({WORD_COLUMNS})
        SELECT id, word, normalized_word, meanings, accepted_answers, phonetic, example_sentence,
            notes, category, tags, difficulty, weight, stability_days, interval_days, ease_factor,
            repetitions, consecutive_correct, attempt_count, correct_count, wrong_count, hint_count,
            last_result, last_reviewed_at, next_review_at, created_at, updated_at, {enabled},
            {group_id}, {study_enabled}, {mark}, {dictation_enabled}, {dictation_state}
        FROM backup_db.words"
    ))
}

/// 恢复前先做安全快照；整个替换在一个事务里完成，失败时回滚并保留原数据。
pub fn restore_backup(
    conn: &mut Connection,
    backup_path: &Path,
    backup_dir: &Path,
    day_key: &str,
    now: i64,
) -> Result<BackupInfo, String> {
    let day_key = sanitize_day_key(day_key)?;
    std::fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let dir = backup_dir
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let source = backup_path
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !source.starts_with(&dir) {
        return Err("备份文件必须位于备份目录内".to_string());
    }
    let source_name = source
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    if !is_backup_file_name(&source_name) {
        return Err("备份文件命名无效".to_string());
    }

    let safety_name = format!("{BACKUP_PREFIX}{day_key}-{now}-pre-restore{BACKUP_SUFFIX}");
    let safety = create_snapshot(conn, &dir.join(&safety_name))?;

    conn.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|error| error.to_string())?;
    let result = (|| -> Result<(), String> {
        conn.execute("ATTACH DATABASE ?1 AS backup_db", params![source.to_string_lossy()])
            .map_err(|error| format!("无法打开备份文件：{error}"))?;
        let outcome = (|| -> Result<(), String> {
            let integrity: String = conn
                .query_row("PRAGMA backup_db.quick_check", [], |row| row.get(0))
                .map_err(|error| format!("备份文件校验失败：{error}"))?;
            if !integrity.eq_ignore_ascii_case("ok") {
                return Err(format!("备份文件已损坏：{integrity}"));
            }
            let word_sql = copy_word_select_sql(conn).map_err(|error| error.to_string())?;
            let has_groups = attached_table_exists(conn, "backup_db", "word_groups")
                .map_err(|error| error.to_string())?;
            let has_logs = attached_table_exists(conn, "backup_db", "review_logs")
                .map_err(|error| error.to_string())?;
            let has_settings = attached_table_exists(conn, "backup_db", "settings")
                .map_err(|error| error.to_string())?;
            let tx = conn.transaction().map_err(|error| error.to_string())?;
            tx.execute("DELETE FROM review_logs", [])
                .map_err(|error| error.to_string())?;
            tx.execute("DELETE FROM words", [])
                .map_err(|error| error.to_string())?;
            tx.execute("DELETE FROM word_groups", [])
                .map_err(|error| error.to_string())?;
            tx.execute("DELETE FROM settings", [])
                .map_err(|error| error.to_string())?;
            if has_groups {
                tx.execute(
                    "INSERT INTO word_groups (id, name, enabled, created_at, updated_at)
                    SELECT id, name, enabled, created_at, updated_at FROM backup_db.word_groups",
                    [],
                )
                .map_err(|error| error.to_string())?;
            }
            tx.execute(&word_sql, [])
                .map_err(|error| error.to_string())?;
            if has_logs {
                tx.execute(
                    "INSERT INTO review_logs (
                        id, word_id, result, hint_used, answer_text, expected_answer,
                        weight_before, weight_after, interval_before, interval_after, reviewed_at
                    )
                    SELECT id, word_id, result, hint_used, answer_text, expected_answer,
                        weight_before, weight_after, interval_before, interval_after, reviewed_at
                    FROM backup_db.review_logs",
                    [],
                )
                .map_err(|error| error.to_string())?;
            }
            if has_settings {
                tx.execute(
                    "INSERT INTO settings (key, value, updated_at)
                    SELECT key, value, updated_at FROM backup_db.settings",
                    [],
                )
                .map_err(|error| error.to_string())?;
            }
            tx.commit().map_err(|error| error.to_string())
        })();
        let _ = conn.execute("DETACH DATABASE backup_db", []);
        outcome
    })();
    let _ = conn.pragma_update(None, "foreign_keys", "ON");
    result.map(|_| safety)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn sample_word(id: &str, word: &str) -> Word {
        Word {
            id: id.to_string(),
            word: word.to_string(),
            normalized_word: word.to_lowercase(),
            meanings: vec!["测试释义".to_string()],
            accepted_answers: vec![],
            phonetic: None,
            example_sentence: None,
            notes: None,
            category: "测试".to_string(),
            tags: vec!["test".to_string()],
            difficulty: 2,
            weight: 3.0,
            stability_days: 0.25,
            interval_days: 0.0,
            ease_factor: 2.5,
            repetitions: 0,
            consecutive_correct: 0,
            attempt_count: 0,
            correct_count: 0,
            wrong_count: 0,
            hint_count: 0,
            last_result: None,
            last_reviewed_at: None,
            next_review_at: 1_000,
            created_at: 1_000,
            updated_at: 1_000,
            enabled: true,
            study_enabled: true,
            group_id: None,
            mark: "none".to_string(),
            dictation_enabled: true,
            dictation_state: initial_state(1_000),
        }
    }

    fn sample_group(id: &str, name: &str) -> WordGroup {
        WordGroup {
            id: id.to_string(),
            name: name.to_string(),
            enabled: true,
            created_at: 1_000,
            updated_at: 1_000,
        }
    }

    fn sample_log(id: &str, word_id: &str, result: &str, reviewed_at: i64) -> ReviewLog {
        ReviewLog {
            id: id.to_string(),
            word_id: word_id.to_string(),
            result: result.to_string(),
            hint_used: false,
            answer_text: "apple".to_string(),
            expected_answer: "apple".to_string(),
            weight_before: 3.0,
            weight_after: 1.95,
            interval_before: 0.0,
            interval_after: 1.0,
            reviewed_at,
        }
    }

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64
    }

    #[test]
    fn creates_lists_updates_and_deletes_words() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        insert_word(&conn, &sample_word("w1", "apple")).unwrap();
        let words = list_words(&conn).unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].meanings, vec!["测试释义"]);

        let mut updated = words[0].clone();
        updated.meanings = vec!["苹果".to_string()];
        updated.weight = 1.2;
        update_word(&conn, &updated).unwrap();
        assert_eq!(get_word(&conn, "w1").unwrap().unwrap().meanings, vec!["苹果"]);

        apply_review(&mut conn, &updated, &sample_log("l1", "w1", "correct", 2_000)).unwrap();
        delete_word(&conn, "w1").unwrap();
        assert!(get_word(&conn, "w1").unwrap().is_none());
        assert!(list_review_logs(&conn, None).unwrap().is_empty());
    }

    #[test]
    fn enforces_unique_normalized_word() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_word(&conn, &sample_word("w1", "apple")).unwrap();

        let mut duplicate = sample_word("w2", "APPLE");
        duplicate.normalized_word = "apple".to_string();
        assert!(insert_word(&conn, &duplicate).is_err());
    }

    #[test]
    fn apply_review_rolls_back_word_when_log_insert_fails() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_word(&conn, &sample_word("w1", "apple")).unwrap();

        let mut after_first = sample_word("w1", "apple");
        after_first.weight = 1.0;
        apply_review(
            &mut conn,
            &after_first,
            &sample_log("duplicate-log", "w1", "correct", 2_000),
        )
        .unwrap();

        let mut after_second = sample_word("w1", "apple");
        after_second.weight = 0.5;
        let err = apply_review(
            &mut conn,
            &after_second,
            &sample_log("duplicate-log", "w1", "wrong", 3_000),
        );
        assert!(err.is_err(), "duplicate log id must fail the transaction");

        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert!((stored.weight - 1.0).abs() < f64::EPSILON);
        assert_eq!(list_review_logs(&conn, None).unwrap().len(), 1);
    }

    #[test]
    fn persists_words_and_logs_across_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("typeword-test.sqlite3");

        {
            let mut conn = open_database(&path).unwrap();
            insert_word(&conn, &sample_word("w1", "persist")).unwrap();
            apply_review(
                &mut conn,
                &sample_word("w1", "persist"),
                &sample_log("l1", "w1", "correct", 5_000),
            )
            .unwrap();
        }

        let conn = open_database(&path).unwrap();
        assert_eq!(list_words(&conn).unwrap().len(), 1);
        assert_eq!(list_review_logs(&conn, None).unwrap().len(), 1);
    }

    #[test]
    fn migrates_legacy_schema_without_losing_words() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO words (id, word, normalized_word, next_review_at, created_at, updated_at)
            VALUES ('legacy', 'legacy', 'legacy', 1000, 1000, 1000)",
            [],
        )
        .unwrap();

        init_schema(&conn).unwrap();
        init_schema(&conn).unwrap();

        let word = get_word(&conn, "legacy").unwrap().unwrap();
        assert!(word.enabled);
        assert!(word.study_enabled);
        assert!(word.group_id.is_none());
        assert_eq!(word.next_review_at, 1_000);
        assert!(word.dictation_enabled);
        assert_eq!(word.dictation_state.weight, 3.0);
        assert_eq!(word.dictation_state.next_review_at, 1_000);
    }

    #[test]
    fn dictation_pool_toggle_and_state_stay_independent() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut word = sample_word("w1", "apple");
        word.enabled = true;
        insert_word(&conn, &word).unwrap();

        set_words_dictation_enabled(&conn, &["w1".to_string()], false).unwrap();
        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!stored.dictation_enabled);
        assert!(stored.enabled);

        let mut reviewed = stored.clone();
        reviewed.dictation_state.weight = 1.2;
        reviewed.dictation_state.attempt_count = 2;
        reviewed.dictation_state.last_result = Some("wrong".to_string());
        reviewed.dictation_state.next_review_at = 9_000;
        update_word(&conn, &reviewed).unwrap();

        let after = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(after.weight, 3.0);
        assert_eq!(after.attempt_count, 0);
        assert_eq!(after.dictation_state.weight, 1.2);
        assert_eq!(after.dictation_state.attempt_count, 2);
        assert_eq!(after.dictation_state.next_review_at, 9_000);
        assert!(!after.dictation_enabled);
    }

    #[test]
    fn dictation_selection_and_state_survive_import_but_reset_clears_state() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut word = sample_word("w1", "apple");
        word.dictation_enabled = false;
        word.dictation_state.weight = 1.1;
        word.dictation_state.attempt_count = 4;
        insert_word(&conn, &word).unwrap();

        let mut imported = sample_word("imported-apple", "apple");
        imported.dictation_enabled = true;
        imported.dictation_state.weight = 7.5;
        imported.dictation_state.attempt_count = 1;
        import_words(&mut conn, &[imported], true).unwrap();

        let merged = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!merged.dictation_enabled);
        assert_eq!(merged.dictation_state.weight, 1.1);
        assert_eq!(merged.dictation_state.attempt_count, 4);

        reset_progress(&mut conn, 6_000).unwrap();
        let reset = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(reset.dictation_state.weight, 3.0);
        assert_eq!(reset.dictation_state.attempt_count, 0);
        assert!(reset.dictation_state.last_result.is_none());
        assert_eq!(reset.dictation_state.next_review_at, 6_000);
    }

    #[test]
    fn undo_review_restores_state_and_records_skip() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let before = sample_word("w1", "apple");
        insert_word(&conn, &before).unwrap();

        let mut wrong = before.clone();
        wrong.weight = 1.95;
        wrong.attempt_count = 1;
        wrong.wrong_count = 1;
        wrong.last_result = Some("wrong".to_string());
        wrong.last_reviewed_at = Some(2_000);
        wrong.next_review_at = 20_000;
        let mut wrong_log = sample_log("l1", "w1", "wrong", 2_000);
        wrong_log.answer_text = "aple".to_string();
        apply_review(&mut conn, &wrong, &wrong_log).unwrap();

        let mut skip_log = sample_log("l2", "w1", "skipped", 3_000);
        skip_log.answer_text = String::new();
        skip_log.weight_before = before.weight;
        skip_log.weight_after = before.weight;
        skip_log.interval_before = before.interval_days;
        skip_log.interval_after = before.interval_days;
        undo_review(&mut conn, "l1", &before, &skip_log).unwrap();

        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(stored.weight, before.weight);
        assert_eq!(stored.attempt_count, 0);
        assert_eq!(stored.wrong_count, 0);
        assert!(stored.last_result.is_none());
        assert_eq!(stored.next_review_at, before.next_review_at);

        let logs = list_review_logs(&conn, None).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, "l2");
        assert_eq!(logs[0].result, "skipped");

        assert!(undo_review(&mut conn, "l1", &wrong, &skip_log).is_err());
        assert_eq!(get_word(&conn, "w1").unwrap().unwrap().weight, before.weight);
        assert_eq!(list_review_logs(&conn, None).unwrap().len(), 1);
    }

    #[test]
    fn groups_toggle_and_delete_keep_word_progress() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();

        insert_group(&conn, &sample_group("g1", "阅读")).unwrap();
        assert!(insert_group(&conn, &sample_group("g2", "阅读")).is_err());

        let mut word = sample_word("w1", "apple");
        word.group_id = Some("g1".to_string());
        word.enabled = false;
        insert_word(&conn, &word).unwrap();

        let mut group = list_groups(&conn).unwrap().remove(0);
        group.name = "阅读真题".to_string();
        group.enabled = false;
        group.updated_at = 2_000;
        update_group(&conn, &group).unwrap();

        let stored_group = list_groups(&conn).unwrap().remove(0);
        assert_eq!(stored_group.name, "阅读真题");
        assert!(!stored_group.enabled);

        let mut reviewed = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!reviewed.enabled);
        assert_eq!(reviewed.group_id.as_deref(), Some("g1"));
        reviewed.weight = 1.95;
        reviewed.attempt_count = 1;
        reviewed.correct_count = 1;
        reviewed.last_result = Some("correct".to_string());
        reviewed.last_reviewed_at = Some(2_000);
        apply_review(
            &mut conn,
            &reviewed,
            &sample_log("l1", "w1", "correct", 2_000),
        )
        .unwrap();

        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!stored.enabled);
        assert_eq!(stored.group_id.as_deref(), Some("g1"));
        assert_eq!(stored.weight, 1.95);

        delete_group(&mut conn, "g1").unwrap();
        assert!(list_groups(&conn).unwrap().is_empty());
        let ungrouped = get_word(&conn, "w1").unwrap().unwrap();
        assert!(ungrouped.group_id.is_none());
        assert!(!ungrouped.enabled);
        assert_eq!(ungrouped.attempt_count, 1);
        assert_eq!(ungrouped.correct_count, 1);
        assert_eq!(ungrouped.weight, 1.95);
        assert_eq!(ungrouped.last_result.as_deref(), Some("correct"));
        assert_eq!(ungrouped.last_reviewed_at, Some(2_000));
    }

    #[test]
    fn batch_scope_updates_keep_learning_progress() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_group(&conn, &sample_group("g1", "阅读")).unwrap();

        let mut first = sample_word("w1", "apple");
        first.weight = 1.4;
        first.attempt_count = 3;
        insert_word(&conn, &first).unwrap();
        insert_word(&conn, &sample_word("w2", "banana")).unwrap();
        insert_word(&conn, &sample_word("w3", "cherry")).unwrap();

        let ids = vec!["w1".to_string(), "w2".to_string()];
        set_words_study_enabled(&conn, &ids, false).unwrap();
        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!stored.study_enabled);
        assert_eq!(stored.weight, 1.4);
        assert_eq!(stored.attempt_count, 3);
        assert!(get_word(&conn, "w3").unwrap().unwrap().study_enabled);

        set_study_selection(
            &mut conn,
            &["w1".to_string(), "w3".to_string()],
            &["w2".to_string()],
        )
        .unwrap();
        assert!(get_word(&conn, "w1").unwrap().unwrap().study_enabled);
        assert!(!get_word(&conn, "w2").unwrap().unwrap().study_enabled);
        assert!(get_word(&conn, "w3").unwrap().unwrap().study_enabled);

        set_words_enabled(&conn, &["w3".to_string()], false).unwrap();
        assert!(!get_word(&conn, "w3").unwrap().unwrap().enabled);
        assert!(get_word(&conn, "w3").unwrap().unwrap().study_enabled);

        set_words_group(&conn, &ids, Some("g1"), 2_000).unwrap();
        let grouped = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(grouped.group_id.as_deref(), Some("g1"));
        assert_eq!(grouped.updated_at, 2_000);
        assert_eq!(grouped.weight, 1.4);
        assert_eq!(grouped.attempt_count, 3);

        set_words_group(&conn, &ids, None, 3_000).unwrap();
        assert!(get_word(&conn, "w1").unwrap().unwrap().group_id.is_none());
        assert!(get_word(&conn, "w2").unwrap().unwrap().group_id.is_none());
    }

    #[test]
    fn study_scope_selection_is_independent_and_survives_import() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_word(&conn, &sample_word("w1", "apple")).unwrap();

        let mut excluded = get_word(&conn, "w1").unwrap().unwrap();
        excluded.study_enabled = false;
        excluded.enabled = true;
        update_word(&conn, &excluded).unwrap();

        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!stored.study_enabled);
        assert!(stored.enabled);

        let mut imported = sample_word("imported-apple", "apple");
        imported.study_enabled = true;
        imported.enabled = false;
        import_words(&mut conn, &[imported], true).unwrap();

        let merged = get_word(&conn, "w1").unwrap().unwrap();
        assert!(!merged.study_enabled);
        assert!(merged.enabled);
    }

    #[test]
    fn seed_import_runs_only_once() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let seeds = vec![sample_word("w1", "apple"), sample_word("w2", "banana")];

        let first = seed_import(&mut conn, &seeds, 10).unwrap();
        assert_eq!(first.inserted, 2);
        assert_eq!(get_setting(&conn, "seed_imported").unwrap().as_deref(), Some("true"));

        let second = seed_import(&mut conn, &seeds, 20).unwrap();
        assert_eq!(second.inserted, 0);
        assert_eq!(second.skipped, 2);
        assert_eq!(list_words(&conn).unwrap().len(), 2);
    }

    #[test]
    fn reset_progress_clears_logs_and_state_but_keeps_words() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut word = sample_word("w1", "apple");
        word.weight = 1.0;
        word.attempt_count = 3;
        insert_word(&conn, &word).unwrap();
        insert_review_log(&conn, &sample_log("l1", "w1", "wrong", 5_000)).unwrap();

        reset_progress(&mut conn, now()).unwrap();
        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(stored.weight, 3.0);
        assert_eq!(stored.attempt_count, 0);
        assert!(stored.last_reviewed_at.is_none());
        assert!(list_review_logs(&conn, None).unwrap().is_empty());
        assert_eq!(list_words(&conn).unwrap().len(), 1);
    }

    #[test]
    fn import_reports_inserted_updates_and_duplicates() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_word(&conn, &sample_word("w1", "apple")).unwrap();

        let mut apple = sample_word("imported-apple", "apple");
        apple.weight = 0.7;
        let banana = sample_word("imported-banana", "banana");

        let skip_outcome = import_words(&mut conn, &[apple.clone(), banana.clone()], false).unwrap();
        assert_eq!(skip_outcome.inserted, 1);
        assert_eq!(skip_outcome.skipped, 1);

        let update_outcome = import_words(&mut conn, &[apple], true).unwrap();
        assert_eq!(update_outcome.updated, 1);
        assert_eq!(get_word(&conn, "w1").unwrap().unwrap().weight, 0.7);
    }

    #[test]
    fn mark_update_keeps_learning_progress_and_survives_import() {
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut word = sample_word("w1", "apple");
        word.weight = 1.4;
        word.attempt_count = 3;
        insert_word(&conn, &word).unwrap();

        set_word_mark(&conn, "w1", "starred", 2_000).unwrap();
        let stored = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(stored.mark, "starred");
        assert_eq!(stored.weight, 1.4);
        assert_eq!(stored.attempt_count, 3);

        let mut imported = sample_word("imported-apple", "apple");
        imported.mark = "mastered".to_string();
        import_words(&mut conn, &[imported], true).unwrap();
        let merged = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(merged.mark, "starred");

        let second = sample_word("w2", "banana");
        insert_word(&conn, &second).unwrap();
        assert_eq!(get_word(&conn, "w2").unwrap().unwrap().mark, "none");
    }

    #[test]
    fn backup_create_list_and_restore_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let backup_dir = dir.path().join("backups");
        let mut conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        insert_group(&conn, &sample_group("g1", "阅读")).unwrap();
        let mut word = sample_word("w1", "apple");
        word.group_id = Some("g1".to_string());
        word.weight = 1.4;
        word.attempt_count = 3;
        word.dictation_enabled = false;
        word.dictation_state.weight = 0.9;
        word.dictation_state.attempt_count = 2;
        insert_word(&conn, &word).unwrap();
        set_word_mark(&conn, "w1", "later", 2_000).unwrap();
        insert_review_log(&conn, &sample_log("l1", "w1", "correct", 2_500)).unwrap();
        set_setting(&conn, "seed_imported", "true", 2_000).unwrap();

        let info = create_backup(&conn, &backup_dir, "2026-10-29", 5_000, false).unwrap();
        assert_eq!(info.file_name, "typeword-backup-2026-10-29.sqlite3");
        assert!(info.size > 0);
        let daily_again = create_backup(&conn, &backup_dir, "2026-10-29", 6_000, false).unwrap();
        assert_eq!(daily_again.file_name, info.file_name);

        delete_word(&conn, "w1").unwrap();
        delete_group(&mut conn, "g1").unwrap();
        assert!(get_word(&conn, "w1").unwrap().is_none());

        let safety = restore_backup(
            &mut conn,
            &backup_dir.join(&info.file_name),
            &backup_dir,
            "2026-10-30",
            7_000,
        )
        .unwrap();
        assert!(safety.file_name.contains("pre-restore"));

        let restored = get_word(&conn, "w1").unwrap().unwrap();
        assert_eq!(restored.mark, "later");
        assert_eq!(restored.group_id.as_deref(), Some("g1"));
        assert_eq!(restored.weight, 1.4);
        assert_eq!(restored.attempt_count, 3);
        assert!(!restored.dictation_enabled);
        assert_eq!(restored.dictation_state.weight, 0.9);
        assert_eq!(restored.dictation_state.attempt_count, 2);
        assert_eq!(list_groups(&conn).unwrap().len(), 1);
        assert_eq!(list_review_logs(&conn, None).unwrap().len(), 1);
        assert_eq!(get_setting(&conn, "seed_imported").unwrap().as_deref(), Some("true"));

        let backups = list_backups(&backup_dir).unwrap();
        assert_eq!(backups.len(), 2);
        assert!(backups.iter().any(|item| item.file_name == info.file_name));
        assert!(is_daily_backup(&info.file_name));
        assert!(!is_daily_backup(&safety.file_name));
        assert!(restore_backup(
            &mut conn,
            dir.path().join("outside.sqlite3").as_path(),
            &backup_dir,
            "2026-10-30",
            8_000,
        )
        .is_err());
    }
}
