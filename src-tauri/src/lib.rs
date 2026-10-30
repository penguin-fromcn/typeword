mod db;
mod tts;

#[cfg(all(test, windows))]
#[link(name = "resource", kind = "static", modifiers = "+whole-archive")]
extern "C" {}

use db::{ImportOutcome, ReviewLog, Word, WordGroup};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

struct DbState {
    connection: Mutex<Connection>,
    database_path: PathBuf,
}

fn friendly_error(error: rusqlite::Error) -> String {
    let message = error.to_string();
    if message.contains("UNIQUE constraint failed: words.normalized_word") {
        return "词库中已存在同名单词".to_string();
    }
    if message.contains("UNIQUE constraint failed: word_groups.name") {
        return "已存在同名分组".to_string();
    }
    if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
        return "记录不存在或已被删除".to_string();
    }
    message
}

#[tauri::command]
fn list_words(state: State<'_, DbState>) -> Result<Vec<Word>, String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::list_words(&connection).map_err(friendly_error)
}

#[tauri::command]
fn insert_word(state: State<'_, DbState>, word: Word) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::insert_word(&connection, &word).map_err(friendly_error)
}

#[tauri::command]
fn update_word(state: State<'_, DbState>, word: Word) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::update_word(&connection, &word).map_err(friendly_error)
}

#[tauri::command]
fn set_words_enabled(state: State<'_, DbState>, ids: Vec<String>, enabled: bool) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_words_enabled(&connection, &ids, enabled).map_err(friendly_error)
}

#[tauri::command]
fn set_words_study_enabled(
    state: State<'_, DbState>,
    ids: Vec<String>,
    enabled: bool,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_words_study_enabled(&connection, &ids, enabled).map_err(friendly_error)
}

#[tauri::command]
fn set_words_dictation_enabled(
    state: State<'_, DbState>,
    ids: Vec<String>,
    enabled: bool,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_words_dictation_enabled(&connection, &ids, enabled).map_err(friendly_error)
}

#[tauri::command]
fn set_study_selection(
    state: State<'_, DbState>,
    enable_ids: Vec<String>,
    disable_ids: Vec<String>,
) -> Result<(), String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_study_selection(&mut connection, &enable_ids, &disable_ids).map_err(friendly_error)
}

#[tauri::command]
fn set_words_group(
    state: State<'_, DbState>,
    ids: Vec<String>,
    group_id: Option<String>,
    now: i64,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_words_group(&connection, &ids, group_id.as_deref(), now).map_err(friendly_error)
}

#[tauri::command]
fn delete_word(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::delete_word(&connection, &id).map_err(friendly_error)
}

#[tauri::command]
fn set_word_mark(state: State<'_, DbState>, id: String, mark: String, now: i64) -> Result<(), String> {
    if !matches!(mark.as_str(), "none" | "starred" | "later" | "mastered") {
        return Err("未知的标记类型".to_string());
    }
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_word_mark(&connection, &id, &mark, now).map_err(friendly_error)
}

fn backup_directory(state: &DbState) -> PathBuf {
    state
        .database_path
        .parent()
        .map(|parent| parent.join("backups"))
        .unwrap_or_else(|| PathBuf::from("backups"))
}

#[tauri::command]
fn create_backup(
    state: State<'_, DbState>,
    day_key: String,
    now: i64,
    manual: bool,
) -> Result<db::BackupInfo, String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::create_backup(&connection, &backup_directory(&state), &day_key, now, manual)
}

#[tauri::command]
fn list_backups(state: State<'_, DbState>) -> Result<Vec<db::BackupInfo>, String> {
    db::list_backups(&backup_directory(&state))
}

#[tauri::command]
fn get_backup_dir(state: State<'_, DbState>) -> Result<String, String> {
    Ok(backup_directory(&state).to_string_lossy().to_string())
}

#[tauri::command]
fn restore_backup(
    state: State<'_, DbState>,
    file_name: String,
    day_key: String,
    now: i64,
) -> Result<db::BackupInfo, String> {
    if !db::is_backup_file_name(&file_name) {
        return Err("备份文件名无效".to_string());
    }
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    let dir = backup_directory(&state);
    db::restore_backup(&mut connection, &dir.join(&file_name), &dir, &day_key, now)
}

#[tauri::command]
fn list_groups(state: State<'_, DbState>) -> Result<Vec<WordGroup>, String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::list_groups(&connection).map_err(friendly_error)
}

#[tauri::command]
fn insert_group(state: State<'_, DbState>, group: WordGroup) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::insert_group(&connection, &group).map_err(friendly_error)
}

#[tauri::command]
fn update_group(state: State<'_, DbState>, group: WordGroup) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::update_group(&connection, &group).map_err(friendly_error)
}

#[tauri::command]
fn delete_group(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::delete_group(&mut connection, &id).map_err(friendly_error)
}

#[tauri::command]
fn submit_review(state: State<'_, DbState>, word: Word, log: ReviewLog) -> Result<(), String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::apply_review(&mut connection, &word, &log).map_err(friendly_error)
}

#[tauri::command]
fn undo_review(
    state: State<'_, DbState>,
    log_id: String,
    restored_word: Word,
    skip_log: ReviewLog,
) -> Result<(), String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::undo_review(&mut connection, &log_id, &restored_word, &skip_log).map_err(friendly_error)
}

#[tauri::command]
fn list_review_logs(state: State<'_, DbState>, since: Option<i64>) -> Result<Vec<ReviewLog>, String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::list_review_logs(&connection, since).map_err(friendly_error)
}

#[tauri::command]
fn get_settings(state: State<'_, DbState>) -> Result<std::collections::HashMap<String, String>, String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::get_settings(&connection).map_err(friendly_error)
}

#[tauri::command]
fn set_setting(
    state: State<'_, DbState>,
    key: String,
    value: String,
    now: i64,
) -> Result<(), String> {
    let connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::set_setting(&connection, &key, &value, now).map_err(friendly_error)
}

#[tauri::command]
fn import_words(
    state: State<'_, DbState>,
    words: Vec<Word>,
    replace_state: bool,
) -> Result<ImportOutcome, String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::import_words(&mut connection, &words, replace_state).map_err(friendly_error)
}

#[tauri::command]
fn seed_import(
    state: State<'_, DbState>,
    words: Vec<Word>,
    now: i64,
) -> Result<ImportOutcome, String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::seed_import(&mut connection, &words, now).map_err(friendly_error)
}

#[tauri::command]
fn restore_seed(
    state: State<'_, DbState>,
    words: Vec<Word>,
    now: i64,
) -> Result<ImportOutcome, String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::restore_seed(&mut connection, &words, now).map_err(friendly_error)
}

#[tauri::command]
fn reset_progress(state: State<'_, DbState>, now: i64) -> Result<(), String> {
    let mut connection = state.connection.lock().map_err(|_| "数据库繁忙".to_string())?;
    db::reset_progress(&mut connection, now).map_err(friendly_error)
}

#[tauri::command]
fn get_database_path(state: State<'_, DbState>) -> Result<String, String> {
    Ok(state.database_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn tts_list_voices(state: State<'_, tts::TtsState>) -> Result<Vec<tts::TtsVoice>, String> {
    let (reply, receiver) = mpsc::channel();
    state.send(tts::Command::List(reply))?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(5))
    })
    .await
    .map_err(|error| error.to_string())?;

    match result {
        Ok(voices) => voices,
        Err(_) => Err("系统语音响应超时".to_string()),
    }
}

#[tauri::command]
async fn tts_speak(
    state: State<'_, tts::TtsState>,
    text: String,
    voice_id: Option<String>,
    rate: f32,
    volume: f32,
) -> Result<(), String> {
    let sender = state.sender();
    let (reply, receiver) = mpsc::channel();
    sender
        .send(tts::Command::Speak {
            text,
            voice_id,
            rate,
            volume,
            done: reply,
        })
        .map_err(|_| "系统语音服务未启动".to_string())?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(Duration::from_secs(30))
    })
    .await
    .map_err(|error| error.to_string())?;

    match result {
        Ok(done) => done,
        Err(_) => {
            let _ = sender.send(tts::Command::Stop);
            Ok(())
        }
    }
}

#[tauri::command]
fn tts_stop(state: State<'_, tts::TtsState>) -> Result<(), String> {
    state.send(tts::Command::Stop)
}

#[tauri::command]
async fn export_json_file(default_name: String, content: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = rfd::FileDialog::new()
            .set_file_name(&default_name)
            .add_filter("JSON", &["json"])
            .save_file();

        match selected {
            Some(path) => {
                std::fs::write(&path, content).map_err(|error| error.to_string())?;
                Ok(Some(path.to_string_lossy().to_string()))
            }
            None => Ok(None),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?;
            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("typeword.sqlite3");
            let connection = db::open_database(&database_path)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;

            app.manage(DbState {
                connection: Mutex::new(connection),
                database_path,
            });
            app.manage(tts::TtsState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_words,
            insert_word,
            update_word,
            set_words_enabled,
            set_words_study_enabled,
            set_words_dictation_enabled,
            set_study_selection,
            set_words_group,
            delete_word,
            set_word_mark,
            create_backup,
            list_backups,
            get_backup_dir,
            restore_backup,
            list_groups,
            insert_group,
            update_group,
            delete_group,
            submit_review,
            undo_review,
            list_review_logs,
            get_settings,
            set_setting,
            import_words,
            seed_import,
            restore_seed,
            reset_progress,
            get_database_path,
            export_json_file,
            tts_list_voices,
            tts_speak,
            tts_stop,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TypeWord");
}
