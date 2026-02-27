import Table from "../gis_dataset/pages/table"
import Upload from "./pages/upload";
import Validate from "./pages/validate";
import Metadata from "../gis_dataset/pages/metadata";
import Admin from "./pages/admin";
import Debug from "./pages/debug";

const InternalDatasetConfig = {
    admin: {
        name: "Admin",
        path: "/admin",
        cdn: () => false, // hide from nav — admin is already in hardcoded allNavItems
        component: Admin,
    },
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
    debug: {
        name: "Debug",
        path: "/debug",
        component: Debug,
    },
};

export default InternalDatasetConfig;
