-- Change log for sync (SQLite version)
-- Tracks all mutations to data_items

CREATE TABLE IF NOT EXISTS change_log (
    revision INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    app TEXT NOT NULL,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_change_log_app_rev
    ON change_log (app, revision);

CREATE TABLE IF NOT EXISTS yjs_states (
    item_id INTEGER PRIMARY KEY,
    state BLOB NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
)
