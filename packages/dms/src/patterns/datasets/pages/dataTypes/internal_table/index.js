import Table from "../gis_dataset/pages/table"
import Upload from "../internal/pages/upload";
import Validate from "../internal/pages/validate";
import Metadata from "../gis_dataset/pages/metadata";
import Admin from "../internal/pages/admin";
import SourceCreate from "./pages/sourceCreate";

const InternalTableConfig = {
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
        cdn: () => false,
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
    sourceCreate: {
        name: "Create",
        component: SourceCreate,
    },
};

export default InternalTableConfig;
