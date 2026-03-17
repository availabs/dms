-- Change log for sync: tracks all mutations to data_items
-- Used by sync endpoints (bootstrap/delta) and WebSocket broadcast

CREATE TABLE IF NOT EXISTS dms.change_log (
    revision BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL,
    app TEXT NOT NULL,
    type TEXT NOT NULL,
    action CHAR(1) NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_change_log_app_rev
    ON dms.change_log (app, revision);

-- Yjs binary state for collaborative editing (Phase 4)
CREATE TABLE IF NOT EXISTS dms.yjs_states (
    item_id BIGINT PRIMARY KEY,
    state BYTEA NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
