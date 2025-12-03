import CreatePage from "./pages/Create";
import Map from "./pages/Map";
import Table from "./pages/table";
import Metadata from "./pages/metadata"

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