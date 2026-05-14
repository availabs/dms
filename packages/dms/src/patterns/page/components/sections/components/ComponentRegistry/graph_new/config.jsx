import React from 'react'
import { Graph, DomainEditor } from './index'
import { getColorRange } from '../../../../../../../ui/components/graph_new/colorRange'
import { ValueFormats } from "../../../../../../../ui/components/graph_new/utils";

const DefaultPalette = getColorRange(20, "div7");

const graphOptions = {
    readyToLoad: false,
    graphType: 'BarGraph',
    groupMode: 'stacked',
    orientation: 'vertical',
    showAttribution: true,
    title: {
        title: ""
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
    margin: {
        top: 20,
        right: 20,
        bottom: 50,
        left: 100
    },
    xAxis: {
        label: "",
        rotateLabels: false,
        showGridLines: false,
        tickDensity: 2,
        show: true
    },
    yAxis: {
        label: "",
        showGridLines: true,
        format: "integer",
        show: true
    },
    legend: {
        show: true,
        label: "",
        position: "right",
        orientation: "vertical",
        size: "medium"
    },
    tooltip: {
        show: true
    }
}

const defaultState = {
    filters: { op: 'AND', groups: [] },
    columns: [],
    data: [],
    display: graphOptions,
    externalSource: { columns: [] }
}

export default {
    "name": 'AVL Graph',
    "type": 'avlGraph',
    "variables": [],

    useDataSource: true,
    useDataWrapper: true,

    fullDataLoad: true,
    useGetDataOnPageChange: false,
    showPagination: false,
    defaultState,
    controls: {
        columns: [
            { type: "select",
                label: "Target", key: "target",
                options: [
                    { label: "X axis", value: "xAxis" },
                    { label: "Y axis", value: "yAxis" },
                    { label: "Categorize", value: "categorize",
                        displayCdn: ({ display }) => display.graphType !== "GridGraph"
                    },
                    { label: "Color", value: "color",
                        displayCdn: ({ display }) => display.graphType === "GridGraph"
                    },
                ],
            },
            { type: 'select',
                label: 'Fn', key: 'fn',
                options: [
                    { label: 'sum', value: 'sum' },
                    { label: 'count', value: 'count' },
                    { label: 'avg', value: 'avg' },
                    { label: 'list', value: 'list' },
                    // { label: 'fn exempt', value: 'exempt' }
                ],
            },     
            { type: 'toggle',
                label: 'Group', key: 'group'
            },  
            { type: 'select',
                label: 'Sort', key: 'sort',
                options: [
                    { label: 'A->Z', value: 'asc' },
                    { label: 'Z->A', value: 'desc' }
                ],
                displayCdn: ({ attribute, display }) => {
                    return (attribute.target === "xAxis") ||
                            (attribute.target === "categorize") ||
                            ((attribute.target === "yAxis") &&
                                (display.graphType === "GridGraph")
                            )
                }
            }
        ],
        // columns: [
        //     {type: 'select', label: 'Fn', key: 'fn', disabled: ({attribute}) => !attribute.yAxis || !attribute.show,
        //         options: [
        //             {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}, {label: 'fn exempt', value: 'exempt'}
        //         ]},
        //     {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
        //         options: [
        //             {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
        //         ]},
        //     {type: 'toggle', label: 'X Axis', key: 'xAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
        //             if(attribute.yAxis || attribute.categorize) return;
        //             state.columns.forEach(column => {
        //                 column.xAxis = value ? column.name === attribute.name : value;
        //                 column.group = column.name === attribute.name ? value : column.categorize;
        //                 column.show = column.name === attribute.name ? value : column.yAxis || column.categorize;
        //             })
        //         }},
        //     {type: 'toggle', label: 'Y Axis', key: 'yAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
        //             if(attribute.xAxis || attribute.categorize) return;
        //             const defaultFn = state.columns[columnIdx].defaultFn?.toLowerCase();
        //             state.columns[columnIdx].fn = value ? (['sum', 'count'].includes(defaultFn) ? defaultFn : 'count') : ''
        //             state.columns[columnIdx].show = value;
        //         }},
        //     {type: 'toggle', label: 'Categorize', key: 'categorize', onChange: ({key, value, attribute, state, columnIdx}) => {
        //             if(attribute.xAxis || attribute.yAxis) return;
        //             state.columns.forEach(column => {
        //                 column.categorize = value ? column.name === attribute.name : value;
        //                 column.group = column.name === attribute.name ? value : column.xAxis;
        //                 column.show = column.name === attribute.name ? value : column.yAxis || column.xAxis;
        //             })
        //         }},
        //     {type: 'select', label: 'Sort', key: 'sort',
        //         options: [
        //             {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
        //         ]},
        //     {type: 'select', label: 'Format', key: 'formatFn',
        //         options: [
        //             {label: 'No Format Applied', value: ' '},
        //             {label: 'Comma Seperated',   value: 'comma'},
        //             {label: 'Abbreviated',       value: 'abbreviate'},
        //         ]},
        // ],
        graph: {
            name: 'Graph',
            items: [
                {   type: 'select',
                    label: 'Graph Type', key: 'graphType',
                    onClickGoBack: true, showValue: true,
                    options: [
                        { label: 'Bar', value: 'BarGraph' },
                        { label: 'Line', value: 'LineGraph' },
                        { label: 'Pie', value: 'PieGraph' },
                        { label: 'Grid', value: 'GridGraph' },
                    ],
                    onChange: ({ key, value, state }) => {
                        if (value === "GridGraph") {
                            state.columns.forEach(col => {
                                if (col.target === "categorize") {
                                    col.target = undefined;
                                }
                            })
                        }
                        else {
                            state.columns.forEach(col => {
                                if (col.target === "color") {
                                    col.target = undefined;
                                }
                            })
                            state.display.legend.position = "right";
                        }
                    }
                },
                {type: 'input', inputType: 'text', label: 'Title',          key: 'title.title'},
                // {type: 'toggle',                   label: 'Legend',          key: 'legend.show'},
                {type: 'toggle',                   label: 'Hide if No Data', key: 'hideIfNull'},
                // {type: 'toggle',                   label: 'Tooltip',         key: 'tooltip.show'},
                {type: 'toggle',                   label: 'Attribution',     key: 'showAttribution'},
                // {type: 'toggle',                   label: 'Scale Filter',    key: 'showScaleFilter'},
                // {type: 'input', inputType: 'number', label: 'Padding',          key: 'padding'},
                {type: 'input', inputType: 'number', label: 'Height',        key: 'height'},
                // {type: 'toggle',                   label: 'Use Custom X Ticks', key: 'useCustomXDomain'},
                {
                    type: ({value, setValue, state}) => (
                        <DomainEditor value={value} setValue={setValue} display={state?.display || {}} />
                    ),
                    label: 'Custom X Ticks', key: 'xDomain',
                    displayCdn: ({display}) => display.useCustomXDomain
                },
            ]
        },
        xAxis: {
            name: 'X Axis',
            items: [
                { type: 'input', inputType: 'text',
                    label: 'Label', key: 'xAxis.label' },
                { type: 'input', inputType: 'number',
                    label: 'Tick Density', key: 'xAxis.tickDensity' },
                { type: 'toggle',
                    label: 'Show Gridlines', key: 'xAxis.showGridLines' },
                { type: 'toggle',
                    label: 'Rotate Labels', key: 'xAxis.rotateLabels' },
                { type: 'toggle',
                    label: 'Show X Axis', key: 'xAxis.show' }
            ]
        },
        yAxis: {
            name: 'Y Axis',
            items: [
                {type: 'input', inputType: 'text',   label: 'Label',        key: 'yAxis.label'},
                {type: 'input', inputType: 'number', label: 'Tick Spacing', key: 'yAxis.tickSpacing'},
                {type: 'select', label: 'Tick Format', key: 'yAxis.format', onClickGoBack: true,
                    // options: [
                    //     {label: 'Default',         value: ''},
                    //     {label: 'Integer',         value: 'Integer'},
                    //     {label: 'Abbreviate',      value: 'abbreviate'},
                    //     {label: 'Comma Separated', value: 'comma'},
                    // ]
                    options: ValueFormats
                },
                {type: 'toggle', label: 'Show Gridlines', key: 'yAxis.showGridLines', defaultValue: true},
                {type: 'toggle', label: 'Rotate Labels',  key: 'yAxis.rotateLabels'},
                {type: 'toggle',                     label: 'Show Y Axis',     key: 'yAxis.show' },
            ]
        },
        margin: {
            name: "Margins",
            items: [
                { type: "input", inputType: "number",
                    label: "Margin Top", key: "margin.top"
                },
                { type: "input", inputType: "number",
                    label: "Margin Right", key: "margin.right"
                },
                { type: "input", inputType: "number",
                    label: "Margin Bottom", key: "margin.bottom"
                },
                { type: "input", inputType: "number",
                    label: "Margin Left", key: "margin.left"
                }
            ]
        },
        legend: {
            name: "Legend",
            displayCdn: ({ display }) => display.graphType !== "GridGraph",
            items: [
                { type: "toggle",
                    label: "Show", key: "legend.show"
                },
                { type: "select",
                    label: "Position", key: "legend.position",
                    options: [
                        { label: "Right", value: "right" },
                        { label: "Left", value: "left" }
                    ]
                }
            ]
        },
        legendForGridGraph: {
            name: "Legend",
            displayCdn: ({ display }) => display.graphType === "GridGraph",
            items: [
                { type: "toggle",
                    label: "Show", key: "legend.show"
                },
                { type: "select",
                    label: "Position", key: "legend.position",
                    options: [
                        { label: "Right", value: "right" },
                        { label: "Left", value: "left" },
                        { label: "Top Right", value: "top-right" },
                        { label: "Top Left", value: "top-left" },
                        { label: "Bottom Right", value: "bottom-right" },
                        { label: "Bottom Left", value: "bottom-left" }
                    ]
                }
            ]
        },
        tooltip: {
            name: "ToolTip",
            displayCdn: ({ display }) => display.graphType !== 'LineGraph',
            items: [
                { type: 'toggle',
                    label: 'Show', key: 'tooltip.show'
                },
                { type: "select",
                    label: "Value Format", key: "tooltip.valueFormat",
                    options: ValueFormats
                }
            ]
        },
        tooltipForLineGraph: {
            name: "ToolTip",
            displayCdn: ({ display }) => display.graphType === 'LineGraph',
            items: [
                { type: "select",
                    label: "Y Format", key: "tooltip.yFormat",
                    options: ValueFormats
                }
            ]
        },
        layout: {
            name: 'Layout',
            displayCdn: ({display}) => display.graphType === 'BarGraph',
            items: [
                {type: 'select', label: 'Orientation', key: 'orientation', onClickGoBack: true,
                    options: [
                        {label: 'Vertical',   value: 'vertical'},
                        {label: 'Horizontal', value: 'horizontal'},
                    ]},
                {type: 'select', label: 'Group Mode', key: 'groupMode', onClickGoBack: true,
                    options: [
                        {label: 'Stacked', value: 'stacked'},
                        {label: 'Grouped', value: 'grouped'},
                    ]},
                // {type: 'toggle', label: 'Log Scale', key: 'isLog'},
            ]
        },
        data: [
            {type: 'toggle', label: 'Prevent Duplicate Fetch', key: 'preventDuplicateFetch'},
            {type: 'toggle', label: 'Always Fetch Data',       key: 'readyToLoad'},
        ]
    },
    "EditComp": Graph,
    "ViewComp": Graph,
}
