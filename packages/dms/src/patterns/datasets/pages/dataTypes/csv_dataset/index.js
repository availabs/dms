import { GisCreate as CreatePage, Table, Metadata } from "../lazyPages";

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
    sourceCreate: {
        name: "Create",
        component: CreatePage,
    },
};

export default GisDatasetConfig;
