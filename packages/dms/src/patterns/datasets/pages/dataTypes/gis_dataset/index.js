import { GisCreate as CreatePage, GisMap as Map, Table, Metadata, Rules } from "../lazyPages";

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
