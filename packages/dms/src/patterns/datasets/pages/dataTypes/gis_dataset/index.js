import { GisCreate as CreatePage, GisMap as Map, Table, Metadata } from "../lazyPages";

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
    sourceCreate: {
        name: "Create",
        component: CreatePage,
    },
};

export default GisDatasetConfig;
