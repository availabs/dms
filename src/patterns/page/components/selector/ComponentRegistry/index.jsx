//
// //import MNYHeader from './mnyHeader';
//
import lexical from './richtext';
import Header from './header'
import MnyHeaderDataDriven from "./mnyHeader/mnyHeaderDataDriven";
import MNYFooter from './footer'
import Spreadsheet from "./spreadsheet";
import Card from "./Card";
import Graph from "./graph"
import ComponentsIndexTable from "../componentsIndexTable";
import FilterComponent from "./FilterComponent";
import UploadComponent from "./UploadComponent";
// //import Item from "./item";
const ComponentRegistry = {
    lexical,
    "Header: Default Header": Header,
    "Header: MNY Data": MnyHeaderDataDriven,
    "Footer: MNY Footer": MNYFooter,
    Card,
    Spreadsheet,
    Graph,
    Filter: FilterComponent,
    Upload: UploadComponent,
    "Table: Components Index": ComponentsIndexTable,
    // //Item,
}


export default ComponentRegistry