PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY,

    word TEXT NOT NULL,
    normalized_word TEXT NOT NULL UNIQUE,
    meanings TEXT NOT NULL DEFAULT '[]',
    accepted_answers TEXT NOT NULL DEFAULT '[]',

    phonetic TEXT,
    example_sentence TEXT,
    notes TEXT,
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    difficulty INTEGER NOT NULL DEFAULT 1,

    weight REAL NOT NULL DEFAULT 3.0,
    stability_days REAL NOT NULL DEFAULT 0.25,
    interval_days REAL NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,

    repetitions INTEGER NOT NULL DEFAULT 0,
    consecutive_correct INTEGER NOT NULL DEFAULT 0,

    attempt_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    hint_count INTEGER NOT NULL DEFAULT 0,

    last_result TEXT,
    last_reviewed_at INTEGER,
    next_review_at INTEGER NOT NULL,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS review_logs (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL,

    result TEXT NOT NULL,
    hint_used INTEGER NOT NULL DEFAULT 0,
    answer_text TEXT NOT NULL,
    expected_answer TEXT NOT NULL,

    weight_before REAL NOT NULL,
    weight_after REAL NOT NULL,
    interval_before REAL NOT NULL,
    interval_after REAL NOT NULL,

    reviewed_at INTEGER NOT NULL,

    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_next_review_at ON words(next_review_at);
CREATE INDEX IF NOT EXISTS idx_words_category ON words(category);
CREATE INDEX IF NOT EXISTS idx_words_difficulty ON words(difficulty);
CREATE INDEX IF NOT EXISTS idx_review_logs_word_id ON review_logs(word_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);
