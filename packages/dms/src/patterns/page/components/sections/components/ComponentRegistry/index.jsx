// Each entry in ComponentRegistry may optionally export a `componentFunctions` key with
// `providers` and `subscribers` arrays. Providers publish page action params on UI events;
// subscribers read them. See component-actions.md in the sections/ directory for the full spec.

import lexical from './richtext/config';
import Spreadsheet from "./spreadsheet/config";
import Card from "./Card.config";
import FilterComponent from "./FilterComponent.config";
// import UploadComponent from "./UploadComponent";
// import ValidateComponent from "./ValidateComponent";
import GraphNew from "./graph_new/config"

// The page pattern's built-in section types: Rich Text, Card, Spreadsheet, Filter and Graph (owner, 2026-11-25).
// Anything else comes from a pattern type (`pageComponents`: the map editor's Map), a theme (`pageComponents`:
// MNY's Header: MNY Data, Footer: MNY Footer and PDF Generator, in src/themes/mny/components), or the app
// (`registerComponents`). "Header: Default Header" and the deprecated "Item" were removed the same day.
const ComponentRegistry = {
    lexical,
    Card,
    Spreadsheet,
    Filter: FilterComponent,
    // Upload: UploadComponent,
    // Validate: ValidateComponent,
    // "Graph" now resolves to the current implementation — sections saved
    // under the legacy element-type upgrade automatically. "AVL Graph" is
    // kept for sections already saved under it, but hidden from the "Type"
    // picker (sectionMenu.jsx) so it doesn't show as a duplicate "Graph" entry.
    Graph: GraphNew,
    "AVL Graph": { ...GraphNew, name: 'AVL Graph', hideInSelector: true },
}


export default ComponentRegistry
