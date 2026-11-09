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
);

-- Access log: distinct permission refusals the guards made, counted (src/access-log/index.js).
-- `outcome` is would-deny (log mode) or refused (enforce). Written by plain upserts, never through dms.data.
CREATE TABLE IF NOT EXISTS access_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app         TEXT    NOT NULL DEFAULT '',
    guard       TEXT    NOT NULL,
    outcome     TEXT    NOT NULL,
    kind        TEXT    NOT NULL,
    target      TEXT    NOT NULL,
    perms       TEXT    NOT NULL DEFAULT '',
    principal   TEXT    NOT NULL,
    user_id     INTEGER,
    user_email  TEXT,
    groups      TEXT,
    reason      TEXT,
    count       INTEGER NOT NULL DEFAULT 0,
    first_seen  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_seen   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (app, guard, outcome, kind, target, perms, principal)
);

CREATE INDEX IF NOT EXISTS idx_access_log_app_last_seen ON access_log (app, last_seen);
