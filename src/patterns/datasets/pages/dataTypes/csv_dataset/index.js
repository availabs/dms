import CreatePage from "../gis_dataset/pages/Create";
import Table from "../gis_dataset/pages/table";
import Metadata from "../gis_dataset/pages/metadata"

const GisDatasetConfig = {
    table: {
        name: "Table",
        path: "/table",
        component: Table,
    },
    metadata: {
        name: "Metadata",
        path: "/metadata",
        component: Metadata,
    },
    sourceCreate: {
        name: "Create",
        component: CreatePage,
    },
};

export default GisDatasetConfig;
