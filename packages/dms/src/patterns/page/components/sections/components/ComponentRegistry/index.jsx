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
    "Map: Dama Map": MapDama //MapDama
}


export default ComponentRegistry
