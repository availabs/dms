export const graphTheme = ({
    text: 'font-regular text-[12px]',
    darkModeText: 'bg-transparent text-white',
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
    scaleWrapper: 'flex rounded-md p-1 divide-x border w-fit',
    scaleItem: 'font-semibold text-gray-500 hover:text-gray-700 px-2 py-1'
})

const demoColumns = [
    { "name": "month", "display_name": "Month", "type": "text", "xAxis": true, show: true },
    { "name": "sales", "display_name": "Sales ($)", "type": "number", "yAxis": true, fn: 'sum', show: true },
    { "name": "region", "display_name": "Region", "type": "text" }
];


const demoData = [
    { "month": "January", "sales": 12000, "region": "North" },
    { "month": "February", "sales": 15000, "region": "South" },
    { "month": "March", "sales": 13000, "region": "East" },
    { "month": "April", "sales": 17000, "region": "West" },
    { "month": "May", "sales": 16000, "region": "North" }
];

const demoDisplay = {
    "graphType": "BarGraph",
    "groupMode": "stacked",
    "orientation": "vertical",
    "showAttribution": true,
    "title": {
        "title": "",
        "position": "start",
        "fontSize": 32,
        "fontWeight": "bold"
    },
    "description": "",
    "bgColor": "#ffffff",
    "textColor": "#000000",
    // "colors": {
    //     "type": "palette",
    //     "value": [
    //         "#D72638",
    //         "#007F5F",
    //         "#F8A100",
    //         "#38BFA7",
    //         "#8F2D56",
    //         "#E2C044",
    //         "#6A4C93",
    //         "#A8C686",
    //         "#FF5D73",
    //         "#5296A5",
    //         "#CC5803",
    //         "#F4B6C2",
    //         "#6D597A",
    //         "#2E294E",
    //         "#D4A373",
    //         "#73C2FB",
    //         "#FFDD67",
    //         "#845EC2",
    //         "#F96167",
    //         "#4B88A2"
    //     ]
    // },
    "height": 300,
    "margins": {
        "marginTop": 20,
        "marginRight": 20,
        "marginBottom": 50,
        "marginLeft": 100
    },
    // "xAxis": {
    //     "label": "",
    //     "rotateLabels": false,
    //     "showGridLines": false,
    //     "tickSpacing": 1
    // },
    // "yAxis": {
    //     "label": "",
    //     "showGridLines": true,
    //     "tickFormat": "Integer"
    // },
    "legend": {
        "show": true,
        "label": ""
    },
    "tooltip": {
        "show": true,
        "fontSize": 12
    },
    // "readyToLoad": true,
    // "xDomain": [],
    // "totalLength": 5
}

export const docs = [
    {
        columns: demoColumns,
        data: demoData,
        display: demoDisplay
    }
]
