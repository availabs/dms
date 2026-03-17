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

-- Expression index for tags queries (partial covering index).
-- Only includes rows with non-null, non-empty tags so the index is small.
-- Covers (app, type, tags) so getTags() is satisfied from the index alone.
CREATE INDEX IF NOT EXISTS idx_data_items_tags
    ON data_items (app, type, json_extract(data, '$.tags'))
    WHERE json_extract(data, '$.tags') IS NOT NULL
    AND json_extract(data, '$.tags') != '';

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

-- Global ID sequence for table splitting (legacy mode).
-- Split tables use IDs pre-allocated from this shared sequence
-- to ensure global uniqueness across data_items and all split tables.
CREATE TABLE IF NOT EXISTS dms_id_seq (id INTEGER PRIMARY KEY AUTOINCREMENT);
