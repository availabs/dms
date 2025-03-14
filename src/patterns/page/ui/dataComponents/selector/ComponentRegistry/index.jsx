import MNYHeader from './mnyHeader';
import MnyHeaderDataDriven from "./mnyHeader/mnyHeaderDataDriven";
import Header from './header'
import lexical from './richtext';
import Spreadsheet from "./spreadsheet";
import Card from "./Card";
import Graph from "./graph"
import Item from "./item";
import ComponentsIndexTable from "../componentsIndexTable";
import FilterComponent from "./FilterComponent";

const ComponentRegistry = {
    lexical,
    "Header: Default Header": Header,
    "Header: MNY Data": MnyHeaderDataDriven,
    Card,
    Spreadsheet,
    Graph,
    Item,
    Filter: FilterComponent,
    "Table: Components Index": ComponentsIndexTable,
 }


export default ComponentRegistry