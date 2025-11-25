import Table from "../gis_dataset/pages/table"
import Upload from "./pages/upload";
import Validate from "./pages/validate";

const InternalDatasetConfig = {
    table: {
        name: "Table",
        path: "/table",
        component: Table,
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
