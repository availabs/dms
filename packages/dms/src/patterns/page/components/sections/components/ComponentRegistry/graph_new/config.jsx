import React from 'react'
import { Graph, DomainEditor } from './index'
import { getColorRange } from '../../../../../../../ui/components/graph/colorRange'

const DefaultPalette = getColorRange(20, "div7");
const graphOptions = {
    readyToLoad: false,
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
    },
    tooltip: {
        show: true,
        fontSize: 12
    }
}

const TICK_FORMATS = [
    { label: "Identity", value: "identity" },
    { label: "Integer", value: "integer" },
    { label: "Float (1 decimal)", value: "float1" },
    { label: "Float (2 decimal)", value: "float2" },
    { label: "Dollars", value: "dollars" },
    { label: "Millions", value: "millions" },
    { label: "Billions", value: "billions" }
]

const defaultState = {
    filters: { op: 'AND', groups: [] },
    columns: [],
    data: [],
    display: graphOptions,
    externalSource: { columns: [] }
}

const homogenizeTargets = rawTargetsMap => {
    const targetsMap = {};

    for (const target in rawTargetsMap) {
        targetsMap[target] = {
            ...rawTargetsMap[target]
        };
        targetsMap[target].keys = rawTargetsMap[target].keys.map(key => {
            if (typeof key === "string") {
                return {
                    key,
                    value: column => column[key] = true
                }
            }
            else if (typeof key === "object") {
                if (typeof key.value === "string") {
                    return {
                        key: key.key,
                        value: column => column[key.key] = key.value
                    }
                }
                return key;
            }
        })
    }

    return targetsMap;
}

const GRAPH_TARGETS_MAP = homogenizeTargets({
    xAxis: {
        exclusive: true,
        keys: ["xAxis"],
        remove: ["fn", "yAxis", "categorize", "color"]
    },
    yAxis: {
        exclusive: false,
        keys: [
            "yAxis",
            // { key: "fn",
            //     value: column => column.fn = (column.defaultFn || "count").toLowerCase()
            // }
        ],
        remove: ["xAxis", "categorize", "color"]
    },
    categorize: {
        keys: ["categorize"],
        exclusive: true,
        remove: ["xAxis", "fn", "yAxis", "color"]
    },
    color: {
        exclusive: true,
        keys: [
            "color",
            // { key: "fn",
            //     value: column => column.fn = (column.defaultFn || "count").toLowerCase()
            // }
        ],
        remove: ["xAxis", "yAxis", "categorize"]
    }
})

const hasNoValue = value => {
    if (value === undefined) return true;
    if (value === null) return true;
    if ((typeof value === "string") && (value.length === 0)) return true;
    if ((typeof value == "object") && (Object.keys(value).length === 0)) return true;
    return false;
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
                    { label: "Categorize", value: "categorize" },
                    { label: "Color", value: "color",
                        displayCdn: ({ display }) => display.graphType === "GridGraph"
                    },
                    // { label: "Grid Height", value: "height",
                    //     displayCdn: ({ display }) => display.graphType === "GridGraph"
                    // },
                    // { label: "Grid Width", value: "width",
                    //     displayCdn: ({ display }) => display.graphType === "GridGraph"
                    // }
                ],
                // onChange: ({ key, state, value, columnIdx, attribute }) => {

                //     const isExclusive = Boolean(GRAPH_TARGETS_MAP[value]?.exclusive);
                //     const hasValue = !hasNoValue(value);

                //     state.columns.forEach((column, i) => {
                //         if (i === columnIdx) {
                //             if (hasValue) {
                //                 GRAPH_TARGETS_MAP[value].keys.forEach(({ key, value }) => {
                //                     column[key] = value(column);
                //                 });
                //                 GRAPH_TARGETS_MAP[value].remove.forEach(k => delete column[k]);
                //             }
                //             else {
                //                 delete column.xAxis;
                //                 delete column.categorize;
                //                 delete column.group;
                //                 delete column.yAxis;
                //             }
                //         }
                //         else if (hasValue && isExclusive) {
                //             const needsRemoval = GRAPH_TARGETS_MAP[value].keys.reduce((a, { key }) => {
                //                 return a && Boolean(column[key]);
                //             }, true);
                //             if (needsRemoval) {
                //                 GRAPH_TARGETS_MAP[value].keys.forEach(({ key }) => {
                //                     delete column[key];
                //                 });
                //                 if (column.target === value) {
                //                     delete column.target;
                //                 }
                //             }
                //         }
                //     })

                // }
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
                // onChange: ({ key, state, value, columnIdx, attribute }) => {
                //     const column = state.columns[columnIdx];
                //     if (hasNoValue(value)) {
                //         column.yAxis = false;
                //         column.categorize = false;
                //         column.target = undefined;
                //     }
                //     else {
                //         column.xAxis = false;
                //         column.yAxis = true;
                //         column.target = "yAxis";
                //     }
                // },
                // displayCdn: ({ attribute }) => attribute.target === "yAxis"
            },     
            { type: 'toggle',
                label: 'Group', key: 'group',
                // displayCdn: ({ attribute }) => attribute.target === "categorize"
            },  
            // { type: 'select',
            //     label: 'Sort', key: 'sort',
            //     options: [
            //         { label: 'Not Sorted', value: '' },
            //         { label: 'A->Z', value: 'asc nulls last' },
            //         { label: 'Z->A', value: 'desc nulls last' }
            //     ],
            //     // displayCdn: ({ attribute }) => attribute.target === "xAxis"
            // },
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
                    options: TICK_FORMATS
                },
                {type: 'toggle', label: 'Show Gridlines', key: 'yAxis.showGridLines', defaultValue: true},
                {type: 'toggle', label: 'Rotate Labels',  key: 'yAxis.rotateLabels'},
                {type: 'toggle',                     label: 'Show Y Axis',     key: 'yAxis.show' },
            ]
        },
        graph: {
            name: 'Graph',
            items: [
                {type: 'select', label: 'Type', key: 'graphType', onClickGoBack: true, showValue: true,
                    options: [
                        {label: 'Bar',     value: 'BarGraph'},
                        {label: 'Line',    value: 'LineGraph'},
                        // {label: 'Scatter', value: 'ScatterPlot'},
                        {label: 'Grid',    value: 'GridGraph'},
                    ]},
                {type: 'input', inputType: 'text', label: 'Title',          key: 'title.title'},
                {type: 'toggle',                   label: 'Legend',          key: 'legend.show'},
                {type: 'toggle',                   label: 'Hide if No Data', key: 'hideIfNull'},
                {type: 'toggle',                   label: 'Tooltip',         key: 'tooltip.show'},
                {type: 'toggle',                   label: 'Attribution',     key: 'showAttribution'},
                {type: 'toggle',                   label: 'Scale Filter',    key: 'showScaleFilter'},
                {type: 'input', inputType: 'number', label: 'Padding',          key: 'padding'},
                {type: 'input', inputType: 'number', label: 'Height',        key: 'height'},
                // {type: 'toggle',                   label: 'Dark Mode',       key: 'darkMode'},,
                { type: "toggle",
                    label: "Make Continuous X Domain",
                    key: "makeContinuousXDomain",
                    displayCdn: ({ display }) => display.graphType === "LineGraph"
                },
                {type: 'toggle',                   label: 'Use Custom X Ticks', key: 'useCustomXDomain'},
                {
                    type: ({value, setValue, state}) => (
                        <DomainEditor value={value} setValue={setValue} display={state?.display || {}} />
                    ),
                    label: 'Custom X Ticks', key: 'xDomain',
                    displayCdn: ({display}) => display.useCustomXDomain
                },
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
