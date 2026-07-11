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
import Graph from "./graph/config"
import FilterComponent from "./FilterComponent.config";
// import UploadComponent from "./UploadComponent";
// import ValidateComponent from "./ValidateComponent";
import PDFGenerator from "./ExportPdf.config";
import Map from "./map/config"
import MapDama from "./map_dama/config"

import GraphNew from "./graph_new/config"

// //import Item from "./item";
const ComponentRegistry = {
    lexical,
    Card,
    Spreadsheet,
    Graph,
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
    "Map: Dama Map": MapDama, //MapDama,

    "AVL Graph": GraphNew,
}


export default ComponentRegistry
