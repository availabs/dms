// Each entry in ComponentRegistry may optionally export a `componentFunctions` key with
// `providers` and `subscribers` arrays. Providers publish page action params on UI events;
// subscribers read them. See component-actions.md in the sections/ directory for the full spec.
//
// //import MNYHeader from './mnyHeader';
//
import lexical from './richtext/config';
import Header from './header.config'
import MnyHeaderDataDriven from "./mnyHeader/config";
import MNYFooter from './footer.config'
import Spreadsheet from "./spreadsheet/config";
import Card from "./Card.config";
import LegacyGraph from "./graph/config"
import FilterComponent from "./FilterComponent.config";
// import UploadComponent from "./UploadComponent";
// import ValidateComponent from "./ValidateComponent";
import PDFGenerator from "./ExportPdf.config";
import Map from "./map/config"
// Kept around for reference — no live element-type resolves to this import
// anymore. "Map: Dama Map" now points at Map (see below); old sections
// upgrade automatically at render time via map/Map.migrate.js.
// import MapDama from "./map_dama/config"

import GraphNew from "./graph_new/config"

// //import Item from "./item";
const ComponentRegistry = {
    lexical,
    Card,
    Spreadsheet,
    // Kept around for reference — no live element-type resolves to this key
    // anymore. "Graph" now points at GraphNew (see below); old sections
    // upgrade automatically at render time via Graph.migrate.js.
    // legacy_graph: LegacyGraph,
    Filter: FilterComponent,
    "Header: Default Header": Header,
    "Header: MNY Data": MnyHeaderDataDriven,
    "Footer: MNY Footer": MNYFooter,
    PDFGenerator,
    // Upload: UploadComponent,
    // Validate: ValidateComponent,
    Item: {
        name: 'Item',
        controls: {},
        EditComp: () => <div>Item Component Deprecated.</div>,
        ViewComp: () => <div>Item Component Deprecated.</div>
    },
    Map,
    // "Map" now resolves to the current implementation — sections saved under
    // the legacy element-type upgrade automatically. "Map: Dama Map" is kept
    // for sections already saved under it, but hidden from the "Type" picker
    // (sectionMenu.jsx) so it doesn't show as a duplicate "Map" entry.
    "Map: Dama Map": { ...Map, name: 'Map: Dama', hideInSelector: true },

    // "Graph" now resolves to the current implementation — sections saved
    // under the legacy element-type upgrade automatically. "AVL Graph" is
    // kept for sections already saved under it, but hidden from the "Type"
    // picker (sectionMenu.jsx) so it doesn't show as a duplicate "Graph" entry.
    Graph: GraphNew,
    "AVL Graph": { ...GraphNew, name: 'AVL Graph', hideInSelector: true },
}


export default ComponentRegistry
