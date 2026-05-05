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
        tickFormat: "Integer",
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
            {type: 'select', label: 'Fn', key: 'fn', disabled: ({attribute}) => !attribute.yAxis || !attribute.show,
                options: [
                    {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}, {label: 'avg', value: 'avg'}, {label: 'fn exempt', value: 'exempt'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'select', label: 'Role', key: 'role',
                options: [
                    {label: 'None',        value: ''},
                    {label: 'X Axis',      value: 'xAxis',      displayCdn: ({display}) => display.graphType !== 'GridGraph'},
                    {label: 'Row',         value: 'xAxis',      displayCdn: ({display}) => display.graphType === 'GridGraph'},
                    {label: 'Y Axis',      value: 'yAxis',      displayCdn: ({display}) => display.graphType !== 'GridGraph'},
                    {label: 'Value',       value: 'yAxis',      displayCdn: ({display}) => display.graphType === 'GridGraph'},
                    {label: 'Categorize',  value: 'categorize', displayCdn: ({display}) => display.graphType !== 'GridGraph'},
                    {label: 'Column',      value: 'categorize', displayCdn: ({display}) => display.graphType === 'GridGraph'},
                ],
                onChange: ({value: newRole, attribute, state, columnIdx}) => {
                    const col = state.columns[columnIdx];
                    if (newRole === 'xAxis') {
                        state.columns.forEach((c, i) => { if (i !== columnIdx && c.xAxis) { c.xAxis = false; c.group = c.categorize || false; c.show = c.yAxis || c.categorize || false; } });
                    } else if (newRole === 'categorize') {
                        state.columns.forEach((c, i) => { if (i !== columnIdx && c.categorize) { c.categorize = false; c.group = c.xAxis || false; c.show = c.yAxis || c.xAxis || false; } });
                    }
                    col.xAxis = newRole === 'xAxis';
                    col.yAxis = newRole === 'yAxis';
                    col.categorize = newRole === 'categorize';
                    // todo remove this and addd group toggle
                    col.group = newRole === 'xAxis' || newRole === 'categorize';
                    col.show = newRole !== '';
                    col.fn = newRole === 'yAxis' ? (['sum', 'count'].includes(col.defaultFn?.toLowerCase()) ? col.defaultFn.toLowerCase() : 'count') : undefined;
                }},
            {type: 'select', label: 'Sort', key: 'sort',
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated',   value: 'comma'},
                    {label: 'Abbreviated',       value: 'abbreviate'},
                ]},
        ],
        xAxis: {
            name: 'X Axis',
            items: [
                {type: 'input', inputType: 'text',   label: 'Label',           key: 'xAxis.label' },
                {type: 'input', inputType: 'number', label: 'Tick Density',    key: 'xAxis.tickDensity' },
                {type: 'toggle',                     label: 'Show Gridlines',  key: 'xAxis.showGridLines' },
                {type: 'toggle',                     label: 'Rotate Labels',   key: 'xAxis.rotateLabels' },
                {type: 'toggle',                     label: 'Show X Axis',     key: 'xAxis.show' },
            ]
        },
        yAxis: {
            name: 'Y Axis',
            items: [
                {type: 'input', inputType: 'text',   label: 'Label',        key: 'yAxis.label'},
                {type: 'input', inputType: 'number', label: 'Tick Spacing', key: 'yAxis.tickSpacing'},
                {type: 'select', label: 'Tick Format', key: 'yAxis.tickFormat', onClickGoBack: true,
                    options: [
                        {label: 'Default',         value: ''},
                        {label: 'Integer',         value: 'Integer'},
                        {label: 'Abbreviate',      value: 'abbreviate'},
                        {label: 'Comma Separated', value: 'comma'},
                    ]},
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
                // {type: 'toggle',                   label: 'Dark Mode',       key: 'darkMode'},
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
                {type: 'toggle', label: 'Log Scale', key: 'isLog'},
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
