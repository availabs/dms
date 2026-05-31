
const SharedThemeOptions = {
    text: "text-base font-regular",
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
    scaleWrapper: 'flex rounded-md p-1 divide-x border w-fit',
    scaleItem: 'font-semibold text-gray-500 hover:text-gray-700 px-2 py-1'
}

// `chartDefaults` are BRAND defaults for the chart visuals, merged UNDER a section's
// own `display` settings (per-section author overrides always win). This lets a theme
// style every graph consistently instead of each section re-specifying colors / margins
// / axes. Keys mirror the `graphFormat` shape GraphComponent reads, so a section built
// with a sparse `display` inherits these. (See graph_new/index.jsx mergeChartDefaults.)
const ChartDefaults = {
    colors: { type: "palette", value: ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"] },
    margin: { top: 20, right: 20, bottom: 50, left: 100 },
    height: 300,
    // LineGraph line/area visuals (a yAxis column's per-series interpolation/area wins).
    interpolation: "catmullrom",
    strokeWidth: 1,
    area: false,
    areaOpacity: 0.15,
    xAxis: { show: true, showGridLines: false, rotateLabels: false, tickDensity: 2, gridLineOpacity: 0.25, axisColor: "currentColor" },
    yAxis: { show: true, showGridLines: true, format: "Integer", gridLineOpacity: 0.25, axisColor: "currentColor" },
    legend: { show: true },
};

export const avlGraphTheme = {
    options: {
        activeStyle: 0
    },
    styles: [
        { name: "Light Mode",
            bgColor: "bg-white",
            textColor: "text-slate-800",
            chartDefaults: ChartDefaults,
            ...SharedThemeOptions
        },
        { name: "Dark Mode",
            bgColor: "bg-slate-800",
            textColor: "text-white",
            chartDefaults: { ...ChartDefaults },
            ...SharedThemeOptions
        }
    ]
}

export const avlGraphSettings = theme => [
    { label: "Graph Styles",
        type: 'inline',
        controls: [
            { label: 'Style',
                type: 'MultiSelect',
                singleSelectOnly: true,
                searchable: false,
                options: (theme?.avlGraph?.styles || [])
                    .map((k, i) => ({ label: k?.name || i, value: i })),
                path: `avlGraph.options.activeStyle`,
            }
        ]
    }
]
