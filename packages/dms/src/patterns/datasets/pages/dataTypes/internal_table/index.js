import {
    Table, Metadata,
    InternalUpload as Upload,
    InternalValidate as Validate,
    InternalAdmin as Admin,
    InternalTableCreate as SourceCreate,
    Indexes,
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
    // The source's database indexes: composite, covering, partial and expression ones an author adds,
    // built in the background (setindex-composite-covering-indexes.md). Reached from the Admin page.
    indexes: {
        name: "Indexes",
        path: "/indexes",
        cdn: () => false,
        component: Indexes,
    },
    sourceCreate: {
        name: "Create",
        component: SourceCreate,
    },
};

export default InternalTableConfig;
