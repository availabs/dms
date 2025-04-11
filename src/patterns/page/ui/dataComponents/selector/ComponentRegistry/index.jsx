import MnyHeaderDataDriven from "./mnyHeader/mnyHeaderDataDriven";
import Header from './header'
import MNYFooter from './footer'
import lexical from './richtext';
import Spreadsheet from "./spreadsheet";
import Card from "./Card";
import Graph from "./graph"
import Item from "./item";
import Map from "./map/MapComponent"
import ComponentsIndexTable from "../componentsIndexTable";
import FilterComponent from "./FilterComponent";
import UploadComponent from "./UploadComponent";

const ComponentRegistry = {
    lexical,
    "Header: Default Header": Header,
    "Header: MNY Data": MnyHeaderDataDriven,
    "Footer: MNY Footer": MNYFooter,
    Card,
    Spreadsheet,
    Graph,
    Item,
    Map,
    Filter: FilterComponent,
    Upload: UploadComponent,
    "Table: Components Index": ComponentsIndexTable,
 }


export default ComponentRegistry