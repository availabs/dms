// Code-split data-type pages. The data-type configs (csv_dataset, gis_dataset,
// internal_table, file_upload, defaultPages) are read eagerly by the datasets
// siteConfig to build its context, but their page components only render
// inside a source page — so the configs point at these lazy wrappers and the
// pages (tables, the gis map + maplibre, upload/validate flows) load on
// demand. One wrapper per page module, shared by every config that uses it.
// See planning/tasks/completed/bundle-split-initial-graph.md.
import { lazyComponent } from "../../../../utils/lazyComponent";

export const Table = lazyComponent('datasets/dataTypes/Table', () => import("./gis_dataset/pages/table"));
export const GisMap = lazyComponent('datasets/dataTypes/Map', () => import("./gis_dataset/pages/Map"));
export const Metadata = lazyComponent('datasets/dataTypes/Metadata', () => import("./gis_dataset/pages/metadata"));
export const GisCreate = lazyComponent('datasets/dataTypes/GisCreate', () => import("./gis_dataset/pages/Create"));
export const InternalUpload = lazyComponent('datasets/dataTypes/InternalUpload', () => import("./internal/pages/upload"));
export const InternalValidate = lazyComponent('datasets/dataTypes/InternalValidate', () => import("./internal/pages/validate"));
export const InternalAdmin = lazyComponent('datasets/dataTypes/InternalAdmin', () => import("./internal/pages/admin"));
export const InternalTableCreate = lazyComponent('datasets/dataTypes/InternalTableCreate', () => import("./internal_table/pages/sourceCreate"));
export const FileUploadCreate = lazyComponent('datasets/dataTypes/FileUploadCreate', () => import("./file_upload/CreatePage"));
export const SchedulePage = lazyComponent('datasets/dataTypes/SchedulePage', () => import("./schedule/SchedulePage"));
export const RunsPage = lazyComponent('datasets/dataTypes/RunsPage', () => import("./schedule/RunsPage"));
