export const ExternalSourceAttributes = [
    "source_id",
    "type",
    "name",
    "display_name",
    "update_interval",
    "category",
    "categories",
    "description",
    "statistics",
    "metadata",
];

// Internal (DMS) datasets have additional attributes stored in the data column
export const InternalSourceAttributes = [
    "source_id",
    "app",
    "type",
    "config",
    "name",
    "display_name",
    "update_interval",
    "category",
    "categories",
    "description",
    "statistics",
    "metadata",
];

export const ExternalViewAttributes = [
    "view_id",
    "source_id",
    "data_type",
    "interval_version",
    "geography_version",
    "version",
    "source_url",
    "publisher",
    "table_schema",
    "table_name",
    "data_table",
    "download_url",
    "tiles_url",
    "start_date",
    "end_date",
    "last_updated",
    "statistics",
    "metadata",
    "user_id",
    "etl_context_id",
    "view_dependencies",
    "_created_timestamp",
    "_modified_timestamp"
];
