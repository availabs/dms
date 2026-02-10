-- DAMA Core Tables for PostgreSQL
-- Data Manager schema: sources and views for external dataset management

CREATE SCHEMA IF NOT EXISTS data_manager;

-- Sources table: dataset metadata
CREATE TABLE IF NOT EXISTS data_manager.sources (
    source_id       SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    display_name    TEXT,
    type            TEXT,
    update_interval TEXT,
    category        TEXT[],
    description     TEXT,
    statistics      JSONB,
    metadata        JSONB,
    categories      JSONB,
    source_dependencies INTEGER[],
    user_id         INTEGER,
    _created_timestamp  TIMESTAMP NOT NULL DEFAULT NOW(),
    _modified_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Views table: versioned views of a source, each pointing to a real data table
CREATE TABLE IF NOT EXISTS data_manager.views (
    view_id             SERIAL PRIMARY KEY,
    source_id           INTEGER NOT NULL REFERENCES data_manager.sources (source_id) ON DELETE CASCADE,
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
    start_date          DATE,
    end_date            DATE,
    last_updated        TIMESTAMP,
    statistics          JSONB,
    metadata            JSONB,
    user_id             INTEGER,
    etl_context_id      INTEGER,
    view_dependencies   INTEGER[],
    _created_timestamp  TIMESTAMP NOT NULL DEFAULT NOW(),
    _modified_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Auto-update _modified_timestamp on sources
CREATE OR REPLACE FUNCTION data_manager.sources_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW._modified_timestamp = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sources_modified ON data_manager.sources;
CREATE TRIGGER sources_modified
    BEFORE UPDATE ON data_manager.sources
    FOR EACH ROW
    EXECUTE FUNCTION data_manager.sources_modified_timestamp();

-- Auto-update _modified_timestamp on views
CREATE OR REPLACE FUNCTION data_manager.views_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW._modified_timestamp = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS views_modified ON data_manager.views;
CREATE TRIGGER views_modified
    BEFORE UPDATE ON data_manager.views
    FOR EACH ROW
    EXECUTE FUNCTION data_manager.views_modified_timestamp();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sources_name ON data_manager.sources (name);
CREATE INDEX IF NOT EXISTS idx_sources_type ON data_manager.sources (type);
CREATE INDEX IF NOT EXISTS idx_views_source_id ON data_manager.views (source_id);
CREATE INDEX IF NOT EXISTS idx_views_table ON data_manager.views (table_schema, table_name);
