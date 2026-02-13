import React, {useContext} from "react";
import {ComponentContext} from "../../../../../context";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import {getColorRange} from "../../../../../../../ui/components/graph/GraphComponent";
import AppearanceControls from "./controls/AppearanceControls";

const Graph = ({isEdit}) => {
    const {state, setState, controls={}} = useContext(ComponentContext);
    const {UI} = useContext(ThemeContext);
    const {Graph} = UI;

    return <Graph {...state} setState={setState} controls={controls} isEdit={isEdit} />

}

const DefaultPalette = getColorRange(20, "div7");
const graphOptions = {
    graphType: 'BarGraph',
    groupMode: 'stacked',
    orientation: 'vertical',
    showAttribution: true,
    title: {
        title: "",
        position: "start",
        fontSize: 32,
        fontWeight: "bold"
    },
    description: "",
    bgColor: "#ffffff",
    textColor: "#000000",
    colors: {
        type: "palette",
        value: [...DefaultPalette]
    },
    height: 300,
    width: undefined,
    margins: {
        marginTop: 20,
        marginRight: 20,
        marginBottom: 50,
        marginLeft: 100
    },
    xAxis: {
        label: "",
        rotateLabels: false,
        showGridLines: false,
        tickSpacing: 1
    },
    yAxis: {
        label: "",
        showGridLines: true,
        tickFormat: "Integer"
    },
    legend: {
        show: true,
        label: "",
    },
    tooltip: {
        show: true,
        fontSize: 12
    }
}
const defaultState = {
    dataRequest: {},
    columns: [],
    data: [],
    display: graphOptions,
    sourceInfo: { columns: [] }
}

export default {
    "name": 'Graph',
    "type": 'Graph',
    "variables": [],
    useDataSource: true,
    useDataWrapper: true,
    fullDataLoad: true,
    useGetDataOnPageChange: false,
    showPagination: false,
    defaultState,
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn', disabled: ({attribute}) => !attribute.yAxis || !attribute.show,
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'toggle', label: 'X Axis', key: 'xAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.yAxis || attribute.categorize) return;

                    // turn off other xAxis columns
                    state.columns.forEach(column => {
                        // if xAxis true, for original column set to true. for others false.
                        column.xAxis = value ? column.name === attribute.name : value;
                        // if turning xAxis off, and not original column, check their category settings.
                        column.group = column.name === attribute.name ? value : column.categorize;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.categorize;
                    })

                }},
            {type: 'toggle', label: 'Y Axis', key: 'yAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.categorize) return;

                    // update default function and add Y Axis column to "show"
                    const defaultFn = state.columns[columnIdx].defaultFn?.toLowerCase();
                    state.columns[columnIdx].fn = value ? (['sum', 'count'].includes(defaultFn) ? defaultFn : 'count') : ''
                    state.columns[columnIdx].show = value;
                }},
            {type: 'toggle', label: 'Categorize', key: 'categorize', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.yAxis) return;

                    // turn off other Category columns
                    state.columns.forEach(column => {
                        // if Category true, for original column set to true. for others false.
                        column.categorize = value ? column.name === attribute.name : value;
                        // if turning Category off, and not original column, check their xAxis settings.
                        column.group = column.name === attribute.name ? value : column.xAxis;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.xAxis;
                    })
                }},
        ],
        appearance: {name: 'Appearance', type: AppearanceControls},
        inHeader: [
            {type: 'select', label: 'Sort', key: 'sort',
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated', value: 'comma'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                ]},
        ]
    },
    "EditComp": Graph,
    "ViewComp": Graph,
}
