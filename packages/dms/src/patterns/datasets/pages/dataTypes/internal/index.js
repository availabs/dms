import Table from "../gis_dataset/pages/table"
import Upload from "./pages/upload";
import Validate from "./pages/validate";
import Metadata from "../gis_dataset/pages/metadata";

const InternalDatasetConfig = {
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
    upload: {
        name: "Upload",
        path: "/upload",
        component: Upload,
    },
    validate: {
        name: "Validate",
        path: "/validate",
        component: Validate,
    },
};

export default InternalDatasetConfig;
