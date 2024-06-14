import React from "react";
const pageSplitIcons = (size1=50, size2=50, height=20, width=30, lines=false) => (
    <svg width={width} height={height} >
        <line
            x1="0"
            y1="0"
            x2="0"
            y2={height}
            stroke="black"
            strokeDasharray="4 1.5 4 1.5" />
        <rect x={size1 === 100 ? 0 : 5} y="0"
              width={Math.max(Math.floor(width * size1 / 100) - (size1 === 100 ? 0 : 6),0)} height={height} rx="1" ry="1"
              style={{fill:'white', stroke:'black', strokeWidth:1, opacity:0.5}} />
        <rect x={(width * size1 / 100) - 1} y="0"
              width={Math.max(Math.floor(width * size2 / 100) -  (size1 === 100 ? 0 : 6),0)} height={height} rx="1" ry="1"
              style={{fill:'white', stroke:'black', strokeWidth:1, opacity:0.5}} />
        <line
            x1={width}
            y1="0"
            x2={width}
            y2={height}
            stroke="black"
            strokeDasharray="4 1.5 4 1.5" />
    </svg>
)

// tested:::
// 1/2 1/2 1/2 1/2 -- makes 2 rows
// 1/3 1/3 1/3 -- makes 1 row
// 1/3 1/3 1/3 1/3 -- makes 2 rows
// 2/3 1/3 -- makes 1 row
// 1/3 2/3 -- makes 1 row
// 1/2 1/3 -- makes 1 row. the next 1/3 goes to a new row

const spans = {
    // spans should sum up to 6 at max
    // only size 2 goes to 8 for lg:
    // for smaller screens, everything spans to 6 cols
    "1/3": 'col-span-6 md:col-span-2',
    "1/2": 'col-span-6 md:col-span-3',
    "2/3": 'col-span-6 md:col-span-4',
    "1":   'col-span-6 md:col-span-6',
    "2":   'col-span-6 md:col-span-8',
}

export const sizeOptionsSVG = [
    {name: '1/3', value: 2, icon: pageSplitIcons(40, 60)},
    {name: '1/2', value: 3, icon: pageSplitIcons(50, 50)},
    {name: '2/3', value: 4, icon: pageSplitIcons(60, 40)},
    {name: '1', value: 6, icon: pageSplitIcons(90, 0)},
    {name: '2', value: 8, icon: pageSplitIcons(100, 0)},
]

export const getSizeClass = (size, requiredSpace, availableSpace, runningColTotal) => {
    if(["2"].includes(size)) {
        return spans[size]
    }

   return  availableSpace < requiredSpace ?
        `${spans[size]} md:col-start-2` : `${spans[size]} md:col-start-${runningColTotal}`;
}

export const sizeGridTemplate = {gridTemplateColumns: '1fr repeat(6, minmax(100px, 190px)) 1fr'}