-- DMS Schema for SQLite
-- This is the SQLite-compatible version of dms.sql

-- Table: data_items
-- Note: SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT instead of sequences
-- Note: SQLite stores JSON as TEXT and uses json_* functions

CREATE TABLE IF NOT EXISTS data_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    created_by INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by INTEGER
);

-- Index: idx_data_items_app_type
CREATE INDEX IF NOT EXISTS idx_data_items_app_type
    ON data_items (app, type);

-- Index for JSON fields - SQLite doesn't support expression indexes directly
-- but we can create indexes on generated columns if needed
-- For now, queries on JSON fields will use the data_items indexes

-- Index: idx_data_items_id (implicit with PRIMARY KEY but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_data_items_id
    ON data_items (id);

-- Formats table for storing format definitions
CREATE TABLE IF NOT EXISTS formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app TEXT NOT NULL,
    type TEXT NOT NULL,
    attributes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(app, type)
);

-- Index for formats
CREATE INDEX IF NOT EXISTS idx_formats_app_type
    ON formats (app, type);
