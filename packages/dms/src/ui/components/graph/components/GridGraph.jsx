import React from "react";
import * as Plot from "@observablehq/plot";
import { useGenericPlotOptions } from "../utils";

const GridGraph = (props) => {
    const { data, bgColor, tooltip } = props;

    const [ref, setRef] = React.useState(null);
    const plotOptions = useGenericPlotOptions(props);

    React.useEffect(() => {
        if (!ref || !data || data.length === 0) return;

        // Extract and sort domains
        const xDomain = Array.from(new Set(data.map(d => d.index))).sort((a, b) => +a - +b);
        const yDomain = Array.from(new Set(data.map(d => d.type))).sort();

        const marks = [
            Plot.cell(
                data,
                Plot.group({ fill: "max" }, {
                    x: (d) => d.index,
                    y: (d) => d.type,
                    fill: (d) => d.value,
                    inset: 0.5,
                    title: (d) => `index: ${d?.index}, type: ${d?.type}, value: ${d?.value?.toFixed(2)}`
                })
            )
        ];

        if (tooltip?.show) {
            marks.push(
                Plot.tip(
                    data,
                    Plot.pointer({
                        x: "index",
                        y: "type",
                        fill: bgColor,
                        fontSize: tooltip.fontSize || 12,
                        title: (d) =>
                            `index: ${d?.index} \ntype: ${d?.type} \nvalue: ${(+d?.value).toFixed(2)}`
                    })
                )
            );
        }

        const plot = Plot.plot({
            ...plotOptions,
            padding: 0,
            // inset: 0.5,
            x: {
                domain: xDomain,
                tickFormat: d => d.toString()
            },
            y: {
                domain: yDomain,
                reverse: true
            },
            color: {
                scheme: "YlOrBr",
                zero: true,
                legend: true
            },
            marks
        });

        ref.innerHTML = "";
        ref.append(plot);

        return () => plot.remove();
    }, [ref, data, plotOptions, bgColor, tooltip]);

    return <div ref={setRef} />;
};

export const GridGraphOption = {
    type: "Grid",
    GraphComp: "GridGraph",
    Component: GridGraph
};

export default GridGraph;
