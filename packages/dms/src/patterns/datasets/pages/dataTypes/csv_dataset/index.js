import { GisCreate as CreatePage, Table, Metadata, GisUploads as Uploads, Rules } from "../lazyPages";

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
    // same Uploads page as gis_dataset — csv publishes through the GIS create flow (2026-10-07)
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
