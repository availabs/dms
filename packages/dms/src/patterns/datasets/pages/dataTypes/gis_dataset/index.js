import { GisCreate as CreatePage, GisMap as Map, Table, Metadata, GisUploads as Uploads, Rules } from "../lazyPages";

const GisDatasetConfig = {
    table: {
        name: "Table",
        path: "/table",
        component: Table,
    },
    metadata: {
        name: "Metadata",
        path: "/metadata",
        cdn: () => false, // hide from nav
        component: Metadata,
    },
    map: {
        name: "Map",
        path: "/map",
        component: Map,
    },
    // ETL contexts that loaded this source → one context's events. The GIS publish flow lands here
    // (/source/:id/uploads/:ctx); hidden from the tab bar like Metadata. Registered 2026-10-07.
    uploads: {
        name: "Uploads",
        path: "/uploads",
        cdn: () => false, // hide from nav
        component: Uploads,
    },
    rules: {
        name: "Rules",
        path: "/rules",
        cdn: () => false, // reached from the Admin page
        component: Rules,
    },
    sourceCreate: {
        name: "Create",
        component: CreatePage,
    },
};

export default GisDatasetConfig;
