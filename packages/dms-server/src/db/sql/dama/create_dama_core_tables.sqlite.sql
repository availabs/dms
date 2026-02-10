-- DAMA Core Tables for SQLite
-- Data Manager tables: sources and views for external dataset management

-- Sources table: dataset metadata
CREATE TABLE IF NOT EXISTS sources (
    source_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    display_name    TEXT,
    type            TEXT,
    update_interval TEXT,
    category        TEXT,
    description     TEXT,
    statistics      TEXT,
    metadata        TEXT,
    categories      TEXT,
    source_dependencies TEXT,
    user_id         INTEGER,
    _created_timestamp  TEXT DEFAULT (datetime('now')),
    _modified_timestamp TEXT DEFAULT (datetime('now'))
);

-- Views table: versioned views of a source, each pointing to a real data table
CREATE TABLE IF NOT EXISTS views (
    view_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id           INTEGER NOT NULL REFERENCES sources (source_id) ON DELETE CASCADE,
    data_type           TEXT,
    interval_version    TEXT,
    geography_version   TEXT,
    version             TEXT DEFAULT '1',
    source_url          TEXT,
    publisher           TEXT,
    table_schema        TEXT,
    table_name          TEXT,
    data_table          TEXT,
    download_url        TEXT,
    tiles_url           TEXT,
    start_date          TEXT,
    end_date            TEXT,
    last_updated        TEXT,
    statistics          TEXT,
    metadata            TEXT,
    user_id             INTEGER,
    etl_context_id      INTEGER,
    view_dependencies   TEXT,
    _created_timestamp  TEXT DEFAULT (datetime('now')),
    _modified_timestamp TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sources_name ON sources (name);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources (type);
CREATE INDEX IF NOT EXISTS idx_views_source_id ON views (source_id);
CREATE INDEX IF NOT EXISTS idx_views_table ON views (table_schema, table_name);
