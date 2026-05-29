import React from 'react'
import { Graph, DomainEditor } from './index'
import { getColorRange, SchemeOptions } from '../../../../../../../ui/components/graph_new/colorSchemeUnifier'
import { ValueFormats } from "../../../../../../../ui/components/graph_new/utils";

const DefaultPalette = getColorRange(20, "div7");

// console.log("SchemeOptions", SchemeOptions)

const graphOptions = {
    readyToLoad: false,
    hideExternalToggle: true,
    graphType: 'BarGraph',

// BarGraph State
    groupMode: 'stacked',
    orientation: 'vertical',
    outerPadding: 0.0,
    innerPadding: 0.0,

// Treemap State
    tileMethod: "treemapSquarify",
    indexTextSize: "medium",
    valueFormat: "identity",
    valueTextSize: "medium",

    showAttribution: true,
    title: {
        title: ""
    },
    description: "",
    bgColor: "#ffffff",
    textColor: "#000000",
    colors: {
        type: "palette",
        value: [...DefaultPalette],
        scheme: null,
        reverse: false
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
        show: true,
        isDollars: false
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
                    { label: "X axis", value: "xAxis",
                        displayCdn: ({ display }) => {
                            return display.graphType !== "PieGraph" &&
                                display.graphType !== "SunburstGraph" &&
                                display.graphType !== "TreemapGraph"
                        }
                    },
                    { label: "Y axis", value: "yAxis",
                        displayCdn: ({ display }) => {
                            return display.graphType !== "PieGraph" &&
                                display.graphType !== "SunburstGraph" &&
                                display.graphType !== "TreemapGraph"
                        }
                    },
                    { label: "Categorize", value: "categorize",
                        displayCdn: ({ display }) => display.graphType !== "GridGraph"
                    },
                    { label: "Index", value: "index",
                        displayCdn: ({ display }) => {
                            return display.graphType === "PieGraph" ||
                                display.graphType === "SunburstGraph" ||
                                display.graphType === "TreemapGraph"
                        }
                    },
                    { label: "Slice", value: "slice",
                        displayCdn: ({ display }) => {
                            return display.graphType === "PieGraph" ||
                                display.graphType === "SunburstGraph"
                        }
                    },
                    { label: "Rectangle", value: "rectangle",
                        displayCdn: ({ display }) => {
                            return display.graphType === "TreemapGraph"
                        }
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
                    { label: 'fn exempt', value: 'exempt' }
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
                            ) ||
                            ((attribute.target === "index") && (
                                    (display.graphType === "PieGraph") ||
                                    (display.graphType === "SunburstGraph") ||
                                    (display.graphType === "TreemapGraph")
                                )
                            )
                }
            }
        ],
        graph: {
            name: 'Graph',
            items: [
                {   type: 'select',
                    label: 'Graph Type', key: 'graphType',
                    onClickGoBack: true, showValue: true,
                    options: [
                        { label: 'Bar Graph', value: 'BarGraph' },
                        { label: 'Line Graph', value: 'LineGraph' },
                        { label: 'Pie Graph', value: 'PieGraph' },
                        { label: 'Grid Graph', value: 'GridGraph' },
                        { label: 'Sunburst Graph', value: 'SunburstGraph' },
                        { label: 'Treemap Graph', value: 'TreemapGraph' }
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
            displayCdn: ({ display }) => {
                return display.graphType !== "SunburstGraph" &&
                        display.graphType !== "TreemapGraph" &&
                        display.graphType !== "PieGraph"
            },
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
            displayCdn: ({ display }) => {
                return display.graphType !== "SunburstGraph" &&
                        display.graphType !== "TreemapGraph" &&
                        display.graphType !== "PieGraph"
            },
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
                { type: "toggle",
                    label: "Use Dollars", key: "yAxis.isDollars"
                },
                {type: 'toggle', label: 'Show Gridlines', key: 'yAxis.showGridLines', defaultValue: true},
                {type: 'toggle', label: 'Rotate Labels',  key: 'yAxis.rotateLabels'},
                {type: 'toggle',                     label: 'Show Y Axis',     key: 'yAxis.show' },
            ]
        },
        colors: {
            name: "Colors",
            items: [
                { type: "select",
                    label: "Scheme", key: "colors.scheme",
                    options: SchemeOptions,
                    onChange: ({ key, value, state }) => {
                        state.display.colors.type = "scheme";
                    }
                },
                { type: "toggle",
                    label: "Reverse", key: "colors.reverse"
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
                },
                { type: "toggle",
                    label: "Use Dollars", key: "tooltip.isDollars"
                }
            ]
        },
        tooltipForLineGraph: {
            name: "ToolTip",
            displayCdn: ({ display }) => display.graphType === 'LineGraph',
            items: [
                { type: 'toggle',
                    label: 'Show', key: 'tooltip.show'
                },
                { type: "select",
                    label: "Y Format", key: "tooltip.yFormat",
                    options: ValueFormats
                },
                { type: "toggle",
                    label: "Use Dollars", key: "tooltip.isDollars"
                }
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
        barGraph: {
            name: 'Bar Graph Layout',
            displayCdn: ({ display }) => display.graphType === 'BarGraph',
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
                { type: "input", inputType: "number",
                    label: "Inner Padding", key: "paddingInner"
                }
                // {type: 'toggle', label: 'Log Scale', key: 'isLog'},
            ]
        },
        treemapGraph: {
            name: "Treemap Graph Display",
            displayCdn: ({ display }) => display.graphType === 'TreemapGraph',
            items: [
                { type: "select",
                    label: "Tile Method", key: "tileMethod", onClickGoBack: true,
                    options: [
                        { label: "Squarify", value: "treemapSquarify" },
                        { label: "Binary", value: "treemapBinary" }
                    ]
                },
                { type: "select",
                    label: "Index Text Size", key: "indexTextSize", onClickGoBack: true,
                    options: [
                        { label: "Extra Small", value: "xsmall" },
                        { label: "Small", value: "small" },
                        { label: "Medium", value: "medium" },
                        { label: "Large", value: "large" },
                        { label: "Extra Large", value: "xlarge" }
                    ]
                },
                { type: "select",
                    label: "Value Text Size", key: "valueTextSize", onClickGoBack: true,
                    options: [
                        { label: "Extra Small", value: "xsmall" },
                        { label: "Small", value: "small" },
                        { label: "Medium", value: "medium" },
                        { label: "Large", value: "large" },
                        { label: "Extra Large", value: "xlarge" }
                    ]
                }
            ]
        },
        data: [
            { type: 'select', label: 'Data Fetch Mode', key: 'fetchMode',
              options: [
                { label: 'Cache (use preloaded data)', value: 'cache' },
                { label: 'Smart (fetch on change)',    value: 'smart' },
                { label: 'Force (always re-fetch)',    value: 'force' },
              ]
            },
        ]
    },
    "EditComp": Graph,
    "ViewComp": Graph,
}
