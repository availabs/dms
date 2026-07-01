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
    created_by INTEGER,
    ip TEXT,
    user_agent TEXT,
    auth_state TEXT
);

CREATE INDEX IF NOT EXISTS idx_change_log_app_rev
    ON change_log (app, revision);

CREATE TABLE IF NOT EXISTS page_visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app         TEXT    NOT NULL,
    page_id     INTEGER,
    url         TEXT,
    action      TEXT,
    ip          TEXT,
    user_agent  TEXT,
    user_id     INTEGER,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_visits_app_created
    ON page_visits (app, created_at);

CREATE INDEX IF NOT EXISTS idx_page_visits_page_id
    ON page_visits (page_id);

CREATE TABLE IF NOT EXISTS yjs_states (
    item_id INTEGER PRIMARY KEY,
    state BLOB NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
)
