-- DMS Schema for PostgreSQL

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS dms;

-- Sequence for data_items
CREATE SEQUENCE IF NOT EXISTS dms.data_items_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;


CREATE TABLE IF NOT EXISTS dms.data_items
(
    id bigint NOT NULL DEFAULT nextval('dms.data_items_id_seq'::regclass),
    app text COLLATE pg_catalog."default" NOT NULL,
    type text COLLATE pg_catalog."default" NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by integer,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by integer,
    CONSTRAINT data_items_pkey PRIMARY KEY (id)
)

TABLESPACE pg_default;

ALTER SEQUENCE dms.data_items_id_seq
    OWNED BY dms.data_items.id;
-- Index: idx_data_items_app_type

-- DROP INDEX IF EXISTS dms.idx_data_items_app_type;

CREATE INDEX IF NOT EXISTS idx_data_items_app_type
    ON dms.data_items USING btree
    (app COLLATE pg_catalog."default" ASC NULLS LAST, type COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_data_items_sections

-- DROP INDEX IF EXISTS dms.idx_data_items_sections;

CREATE INDEX IF NOT EXISTS idx_data_items_sections
    ON dms.data_items USING gin
    (data jsonb_path_ops)
    TABLESPACE pg_default;
-- Index: idx_hide_in_nav

-- DROP INDEX IF EXISTS dms.idx_hide_in_nav;

CREATE INDEX IF NOT EXISTS idx_hide_in_nav
    ON dms.data_items USING btree
    ((data ->> 'hide_in_nav'::text) COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;

COMMENT ON INDEX dms.idx_hide_in_nav
    IS 'index to improve performance of selecting nav-visible pages in case of high number of template generated pages';
-- Index: idx_tags

-- DROP INDEX IF EXISTS dms.idx_tags;

CREATE INDEX IF NOT EXISTS idx_tags
    ON dms.data_items USING btree
    ((data ->> 'tags'::text) COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;
-- Index: idx_title

-- DROP INDEX IF EXISTS dms.idx_title;

CREATE INDEX IF NOT EXISTS idx_title
    ON dms.data_items USING btree
    ((data ->> 'title'::text) COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;

-- Formats table for storing format definitions
CREATE TABLE IF NOT EXISTS dms.formats
(
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    app text NOT NULL,
    type text NOT NULL,
    attributes jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(app, type)
);

CREATE INDEX IF NOT EXISTS idx_formats_app_type
    ON dms.formats USING btree (app, type);