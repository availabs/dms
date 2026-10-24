import {
    Table, Metadata,
    InternalUpload as Upload,
    InternalValidate as Validate,
    InternalAdmin as Admin,
    InternalTableCreate as SourceCreate,
} from "../lazyPages";

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
        // rows into the version: what the server's DMS publish / validate route requires (dama/upload/auth.js)
        reqPermissions: ['edit-source-data', 'update-source'],
        component: Upload,
    },
    validate: {
        name: "Validate",
        path: "/validate",
        // rows into the version: what the server's DMS publish / validate route requires (dama/upload/auth.js)
        reqPermissions: ['edit-source-data', 'update-source'],
        component: Validate,
    },
    sourceCreate: {
        name: "Create",
        component: SourceCreate,
    },
};

export default InternalTableConfig;
