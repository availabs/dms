import React from 'react'
import { Graph, DomainEditor } from './index'
import { getComponentTheme } from '../../../../../../../ui/useTheme'
import { getColorRange, SchemeOptions } from '../../../../../../../ui/components/graph_new/colorSchemeUnifier'
import { ValueFormats } from "../../../../../../../ui/components/graph_new/utils";

const DefaultPalette = getColorRange(20, "div7");

// console.log("SchemeOptions", SchemeOptions)

const componentFunctions = {
  providers: [
    { id: 'hover_publish',
      label: 'Hover: Publish Column',
      description: 'On hover, publishes a column value to a page action param. Clears on mouse leave.',
      trigger: 'hover',
      args: [
        { key: 'column', label: 'Column to publish', type: 'column-select' },
      ],
    }
  ],
  subscribers: [
    { id: 'hover_highlight',
      label: 'Hover: Highlight Column',
      description: 'Highlights graph parts represented by received column.',
      trigger: 'action_param',
      args: [
        { key: 'column', label: 'Column to highlight', type: 'column-select' },
        { key: "hhl_color", label: "Highlight color", type: "colorpicker", defaultValue: "#ff0000" }
      ],
    },
    // Comparison Series — dynamic binding (Piece 3). Reads a list of variants from a
    // page action param (the `paramKey`) and overlays one chart series per variant.
    // This is a RELOAD-DRIVING subscriber: usePageFilterSync resolves the list into
    // comparisonSeries.config (a fetchKey input), so each publish refetches the
    // fan-out. Pair with a discrete (click) provider only — never a hover provider.
    // labelKey/valueKey name the fields on each published entry; `column` (optional)
    // turns a scalar value into a filter leaf when the value isn't itself a filter tree.
    // Requires the Comparison Series master switch (Dataset menu) to be ON.
    { id: 'comparison_series',
      label: 'Comparison Series: Bind Variants',
      description: 'Overlays one series per variant read from a page action param (reload-driving). Needs the Comparison Series master switch ON.',
      trigger: 'action_param',
      args: [
        { key: 'labelKey', label: 'Label property', type: 'input' },
        { key: 'valueKey', label: 'Value / filter property', type: 'input' },
        { key: 'column', label: 'Filter column (optional)', type: 'input' },
      ],
    }
  ]
};

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
// LineGraph line/area defaults (per-series settings on a yAxis column override these)
    interpolation: "catmullrom",
    strokeWidth: 1,
    area: false,
    areaOpacity: 0.15,
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

const graphConfig = {
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
            },
            // Per-series line shape. `step` draws a held line — used to turn a joined
            // target column into the stepped FHWA reference line while the data series
            // stays smooth. Only meaningful for a yAxis series on a LineGraph.
            { type: 'select',
                label: 'Interpolation', key: 'interpolation',
                options: [
                    { label: 'Curved (catmullrom)', value: 'catmullrom' },
                    { label: 'Linear', value: 'linear' },
                    { label: 'Step', value: 'step' },
                    { label: 'Monotone', value: 'monotone' },
                    { label: 'Basis', value: 'basis' }
                ],
                displayCdn: ({ attribute, display }) =>
                    (attribute.target === "yAxis") && (display.graphType === "LineGraph")
            },
            { type: 'toggle',
                label: 'Area Fill', key: 'area',
                displayCdn: ({ attribute, display }) =>
                    (attribute.target === "yAxis") && (display.graphType === "LineGraph")
            },
            // Per-series colour + dash — used to style a joined target column as a
            // dashed reference line (e.g. amber `#EAAD43`, dash `6 4`, step interp).
            { type: 'input', inputType: 'text',
                label: 'Series Color', key: 'color',
                displayCdn: ({ attribute, display }) =>
                    (attribute.target === "yAxis") && (display.graphType === "LineGraph")
            },
            { type: 'select',
                label: 'Dash', key: 'dashArray',
                options: [
                    { label: 'Solid', value: '' },
                    { label: 'Dashed', value: '6 4' },
                    { label: 'Dotted', value: '2 3' }
                ],
                displayCdn: ({ attribute, display }) =>
                    (attribute.target === "yAxis") && (display.graphType === "LineGraph")
            },
            // Per-series point marks (dots at each datum, like the design mock).
            // Falls back to the chart-level `showMarks` default when unset.
            { type: 'toggle',
                label: 'Point Marks', key: 'showMarks',
                displayCdn: ({ attribute, display }) =>
                    (attribute.target === "yAxis") && (display.graphType === "LineGraph")
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
                    label: 'Show X Axis', key: 'xAxis.show' },
                // Axis typography (CSS values, e.g. "11px" / a font stack / "#64748b").
                // Unset → inherits the theme/component default (BC).
                { type: 'input', inputType: 'text', label: 'Tick Font Size',   key: 'xAxis.tickFontSize' },
                { type: 'input', inputType: 'text', label: 'Tick Font Family', key: 'xAxis.tickFontFamily' },
                { type: 'input', inputType: 'text', label: 'Tick Font Weight', key: 'xAxis.tickFontWeight' },
                { type: 'input', inputType: 'text', label: 'Tick Color',       key: 'xAxis.tickColor' },
                { type: 'input', inputType: 'text', label: 'Label Font Size',   key: 'xAxis.labelFontSize' },
                { type: 'input', inputType: 'text', label: 'Label Font Family', key: 'xAxis.labelFontFamily' },
                { type: 'input', inputType: 'text', label: 'Label Font Weight', key: 'xAxis.labelFontWeight' },
                { type: 'input', inputType: 'text', label: 'Label Color',       key: 'xAxis.labelColor' }
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
                // Custom y-domain. Unset → auto-scale to the data (current behavior).
                // e.g. set Domain Max = 100 to fix the top of a percent chart.
                {type: 'input', inputType: 'number', label: 'Domain Min', key: 'yAxis.domainMin'},
                {type: 'input', inputType: 'number', label: 'Domain Max', key: 'yAxis.domainMax'},
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
                // Axis typography (CSS values, e.g. "11px" / a font stack / "#64748b").
                // Unset → inherits the theme/component default (BC).
                { type: 'input', inputType: 'text', label: 'Tick Font Size',   key: 'yAxis.tickFontSize' },
                { type: 'input', inputType: 'text', label: 'Tick Font Family', key: 'yAxis.tickFontFamily' },
                { type: 'input', inputType: 'text', label: 'Tick Font Weight', key: 'yAxis.tickFontWeight' },
                { type: 'input', inputType: 'text', label: 'Tick Color',       key: 'yAxis.tickColor' },
                { type: 'input', inputType: 'text', label: 'Label Font Size',   key: 'yAxis.labelFontSize' },
                { type: 'input', inputType: 'text', label: 'Label Font Family', key: 'yAxis.labelFontFamily' },
                { type: 'input', inputType: 'text', label: 'Label Font Weight', key: 'yAxis.labelFontWeight' },
                { type: 'input', inputType: 'text', label: 'Label Color',       key: 'yAxis.labelColor' },
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
                },
                { type: "toggle",
                    label: "Show Totals", key: "tooltip.showTotal", defaultValue: true
                },
                { type: "toggle",
                    label: "Single cell (grid hover)", key: "tooltip.singleCell"
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
                },
                { type: "toggle",
                    label: "Show Totals", key: "tooltip.showTotal", defaultValue: true
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
        lineGraph: {
            name: 'Line Graph Layout',
            displayCdn: ({ display }) => display.graphType === 'LineGraph',
            items: [
                { type: 'select', label: 'Interpolation (default)', key: 'interpolation', onClickGoBack: true,
                    options: [
                        { label: 'Curved (catmullrom)', value: 'catmullrom' },
                        { label: 'Linear', value: 'linear' },
                        { label: 'Step', value: 'step' },
                        { label: 'Monotone', value: 'monotone' },
                        { label: 'Basis', value: 'basis' }
                    ]
                },
                { type: 'input', inputType: 'number', label: 'Line Width', key: 'strokeWidth' },
                { type: 'toggle', label: 'Area Fill (default)', key: 'area' },
                { type: 'input', inputType: 'number', label: 'Area Opacity', key: 'areaOpacity' },
                { type: 'toggle', label: 'Point Marks (default)', key: 'showMarks' }
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
                },
                // Bar fill-opacity. Blank → the CSS default (0.75, :hover → 1).
                // Set to 1 for solid, design-matching bars (0–1).
                { type: "input", inputType: "number",
                    label: "Bar Opacity", key: "barOpacity"
                }
                // {type: 'toggle', label: 'Log Scale', key: 'isLog'},
            ]
        },
        pieGraph: {
          name: "Pie Graph Layout",
          displayCdn: ({ display }) => display.graphType === 'PieGraph',
          items: [
            { type: "toggle",
              label: "Show Axis", key: "pieAxis.showAxis"
            },
            { type: "input", inputType: "number",
              label: "Tick Density", key: "pieAxis.tickDensity"
            },
            { type: "toggle",
              label: "Show Values", key: "pieAxis.showValue"
            },
            { type: "select",
                label: "Value Text Size", key: "pieAxis.valueTextSize", onClickGoBack: true,
                options: [
                    { label: "Extra Small", value: "xsmall" },
                    { label: "Small", value: "small" },
                    { label: "Medium", value: "medium" },
                    { label: "Large", value: "large" },
                    { label: "Extra Large", value: "xlarge" }
                ]
            },
            { type: 'select',
              label: 'Value Format', key: 'pieAxis.valueFormat', onClickGoBack: true,
                options: ValueFormats
            },
            { type: "toggle",
              label: "Show Dollars", key: "pieAxis.isDollars"
            }
          ]
        },
        sunburstGraph: {
            name: "Sunburst Graph Display",
            displayCdn: ({ display }) => display.graphType === 'SunburstGraph',
            items: [
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
    componentFunctions,
    "EditComp": Graph,
    "ViewComp": Graph,
}

// `controls` as a function of the live theme (the dataWrapper resolves it — same hook
// Card.config uses): the margin inputs show the EFFECTIVE default as a placeholder.
// Margins merge the theme's `avlGraph.chartDefaults.margin` under a section's own
// display (GraphComponent falls back to 20/20/50/100 when neither is set) — without
// the placeholder an empty input silently means "some theme value", which reads as a
// mystery to the author.
const GRAPH_MARGIN_FALLBACK = { top: 20, right: 20, bottom: 50, left: 100 };

const controlsWithThemeDefaults = (fullTheme) => {
    const themeMargin = getComponentTheme(fullTheme, 'avlGraph')?.chartDefaults?.margin || {};
    const items = graphConfig.controls.margin.items.map(item => {
        const side = item.key.split('.')[1];
        const effective = themeMargin[side] ?? GRAPH_MARGIN_FALLBACK[side];
        return {
            ...item,
            // sectionMenu shows `value ?? defaultValue` in the row + input — the effective
            // merged margin displays without being written to the section's display.
            defaultValue: effective,
            // MoreControls' InputControl renders this as the input placeholder.
            placeHolder: `${effective} (theme default)`,
        };
    });
    return { ...graphConfig.controls, margin: { ...graphConfig.controls.margin, items } };
};

export default { ...graphConfig, controls: controlsWithThemeDefaults };