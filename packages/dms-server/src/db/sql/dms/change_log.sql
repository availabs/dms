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
    created_by INTEGER,
    ip TEXT,
    user_agent TEXT,
    auth_state TEXT
);

CREATE INDEX IF NOT EXISTS idx_change_log_app_rev
    ON dms.change_log (app, revision);

-- Page visit log: one row per page view, written by POST /track/visit
CREATE TABLE IF NOT EXISTS dms.page_visits (
    id          BIGSERIAL PRIMARY KEY,
    app         TEXT        NOT NULL,
    page_id     BIGINT,
    url         TEXT,
    action      TEXT,
    ip          TEXT,
    user_agent  TEXT,
    user_id     INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_visits_app_created
    ON dms.page_visits (app, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_visits_page_id
    ON dms.page_visits (page_id);

-- Yjs binary state for collaborative editing (Phase 4)
CREATE TABLE IF NOT EXISTS dms.yjs_states (
    item_id BIGINT PRIMARY KEY,
    state BYTEA NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
