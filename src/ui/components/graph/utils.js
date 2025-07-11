import React from "react"

import uniq from "lodash/uniq"
import {formatFunctions} from "../../../patterns/page/components/selector/dataWrapper/utils/utils";


const fnum = (number, currency = false) => `${currency ? '$ ' : ''} ${isNaN(number) ? 0 : parseInt(number).toLocaleString()}`;
export const fnumIndex = (d, fractions = 2, currency = false) => {
        if(isNaN(d)) return '0'
        if(typeof d === 'number' && d < 1) return `${currency ? '$' : ``} ${d?.toFixed(fractions)}`
        if (d >= 1_000_000_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000_000_000).toFixed(fractions)} Q`;
        }else if (d >= 1_000_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000_000).toFixed(fractions)} T`;
        } else if (d >= 1_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000).toFixed(fractions)} B`;
        } else if (d >= 1_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000).toFixed(fractions)} M`;
        } else if (d >= 1_000) {
            return `${currency ? '$' : ``} ${(d / 1_000).toFixed(fractions)} K`;
        } else {
            return typeof d === "object" ? `` : `${currency ? '$' : ``} ${parseInt(d)}`;
        }
    }
;
export const strictNaN = v => {
    const NaNValues = ["", null]
    if (NaNValues.includes(v)) return true;
    return isNaN(v);
}
export const useAxisTicks = (data, tickSpacing, key = "index") => {
    return React.useMemo(() => {
        const indexes = uniq(data.map(d => d[key]));
        return indexes.reduce((a, c, i) => {
            if ((i % tickSpacing) === 0) {
                a.push(c);
            }
            return a;
        }, [])
    }, [data, tickSpacing])
}

export const useGenericPlotOptions = props => {
    const {
        data,
        margins,
        height,
        width,
        xAxis,
        yAxis,
        colors,
        legend
    } = props;

    const xAxisTicks = useAxisTicks(data, xAxis.tickSpacing);

    const graphHeight = React.useMemo(() => {
        const {marginTop: mt, marginBottom: mb} = margins;
        if ((mt + mb) > height) {
            return mt + mb + 100;
        }
        return height;
    }, [height, margins]);

    return React.useMemo(() => {
        return {
            x: {
                type: "point",
                label: xAxis.label || xAxis.name,
                grid: xAxis.showGridLines,
                textAnchor: xAxis.rotateLabels ? "start" : "middle",
                tickRotate: xAxis.rotateLabels ? 45 : 0,
                axis: "bottom",
                ticks: xAxisTicks
            },
            y: {
                axis: "left",
                grid: yAxis.showGridLines,
                tickFormat: formatFunctions[yAxis.tickFormat],
                label: yAxis.label
            },
            color: {
                legend: legend.show,
                width: legend.width,
                height: legend.height,
                label: legend.label,
                range: colors.value
            },
            height: graphHeight,
            width,
            ...margins
        }
    }, [margins, graphHeight, width, xAxis, yAxis, colors, legend]);
}

export const useGenericTipOptions = props => {
    const {
        bgColor,
        tooltip
    } = props;
    return React.useMemo(() => {
        return !tooltip.show ? undefined :
            {
                fill: bgColor,
                fontSize: tooltip.fontSize,
                x: "index",
                y: "value"
            }
    }, [bgColor, tooltip]);
}

export const mapColors = {
    "seq1": {
        "2": ["#f7e76e", "#ce141f"],
        "3": ["#f7e76e", "#ec962a", "#ce141f"],
        "4": ["#f7e76e", "#f1b33d", "#e5751d", "#ce141f"],
        "5": ["#f7e76e", "#f3c048", "#ec962a", "#e1631a", "#ce141f"],
        "6": ["#f7e76e", "#f4c94f", "#efa835", "#e88321", "#de581a", "#ce141f"],
        "7": ["#f7e76e", "#f4ce54", "#f1b33d", "#ec962a", "#e5751d", "#dc501a", "#ce141f"],
        "8": ["#f7e76e", "#f5d157", "#f2bb43", "#eea331", "#e98823", "#e36b1b", "#da491b", "#ce141f"],
        "9": ["#f7e76e", "#f5d45a", "#f3c048", "#f0ac38", "#ec962a", "#e77e1f", "#e1631a", "#d9451b", "#ce141f"],
    },
    "seq2": {
        "2": ["#fde89b", "#4d53b3"],
        "3": ["#fde89b", "#f37b8a", "#4d53b3"],
        "4": ["#fde89b", "#ff9e81", "#d4629b", "#4d53b3"],
        "5": ["#fde89b", "#ffb080", "#f37b8a", "#bd5aa4", "#4d53b3"],
        "6": ["#fde89b", "#ffbc82", "#fe8f83", "#e36a94", "#ad57a9", "#4d53b3"],
        "7": ["#fde89b", "#ffc385", "#ff9e81", "#f37b8a", "#d4629b", "#a056ac", "#4d53b3"],
        "8": ["#fde89b", "#ffc887", "#ffa880", "#fb8985", "#e86f91", "#c85da0", "#9755ad", "#4d53b3"],
        "9": ["#fde89b", "#ffcc88", "#ffb080", "#ff9582", "#f37b8a", "#de6797", "#bd5aa4", "#9055af", "#4d53b3"],
    },
    "seq3": {
        "2": ["#f2e68c", "#035d6d"],
        "3": ["#f2e68c", "#59a884", "#035d6d"],
        "4": ["#f2e68c", "#87bf84", "#319082", "#035d6d"],
        "5": ["#f2e68c", "#a0ca84", "#59a884", "#1f837f",
            "#035d6d"],
        "6": ["#f2e68c", "#afd084", "#74b684", "#409984",
            "#147b7d", "#035d6d"],
        "7": ["#f2e68c", "#bad485", "#87bf84", "#59a884",
            "#319082", "#0e767b", "#035d6d"],
        "8": ["#f2e68c", "#c2d785", "#95c584", "#6cb284",
            "#479e84", "#268881", "#097379", "#035d6d"],
        "9": ["#f2e68c", "#c8d986", "#a0ca84", "#7bb984",
            "#59a884", "#3a9683", "#1f837f", "#077078",
            "#035d6d"],
    },
    "seq4": {
        "2": ["#e8e873", "#4b5899"],
        "3": ["#e8e873", "#2cbaa8", "#4b5899"],
        "4": ["#e8e873", "#62d198", "#209eb0", "#4b5899"],
        "5": ["#e8e873", "#84d98c", "#2cbaa8", "#2d8eaf",
            "#4b5899"],
        "6": ["#e8e873", "#98dd85", "#4ac9a0", "#1caaae",
            "#3483ad", "#4b5899"],
        "7": ["#e8e873", "#a5e081", "#62d198", "#2cbaa8",
            "#209eb0", "#397cab", "#4b5899"],
        "8": ["#e8e873", "#afe17e", "#75d691", "#41c5a2",
            "#1eafad", "#2795af", "#3d77a9", "#4b5899"],
        "9": ["#e8e873", "#b6e27c", "#84d98c", "#53cc9d",
            "#2cbaa8", "#1ca5af", "#2d8eaf", "#3f74a8",
            "#4b5899"],
    },
    "seq5": {
        "2": ["#f3cdb4", "#c33c3c"],
        "3": ["#f3cdb4", "#dd8a6c", "#c33c3c"],
        "4": ["#f3cdb4", "#e5a182", "#d57259", "#c33c3c"],
        "5": ["#f3cdb4", "#e8ac8d", "#dd8a6c", "#d16651", "#c33c3c"],
        "6": ["#f3cdb4", "#eab395", "#e29879", "#d87c61", "#ce5e4c", "#c33c3c"],
        "7": ["#f3cdb4", "#ecb79a", "#e5a182", "#dd8a6c", "#d57259", "#cc5949", "#c33c3c"],
        "8": ["#f3cdb4", "#edba9d", "#e7a788", "#e09475", "#da8064", "#d36b54", "#cb5547", "#c33c3c"],
        "9": ["#f3cdb4", "#eebda0", "#e8ac8d", "#e39b7c", "#dd8a6c", "#d7785e", "#d16651", "#ca5246", "#c33c3c"],
    },
    "seq6": {
        "2": ["#f6e389", "#cd4c71"],
        "3": ["#f6e389", "#f49566", "#cd4c71"],
        "4": ["#f6e389", "#f7af6b", "#ec7b66", "#cd4c71"],
        "5": ["#f6e389", "#f8bc70", "#f49566", "#e66e68", "#cd4c71"],
        "6": ["#f6e389", "#f8c474", "#f6a568", "#ef8566", "#e26769", "#cd4c71"],
        "7": ["#f6e389", "#f8c976", "#f7af6b", "#f49566", "#ec7b66", "#df626b", "#cd4c71"],
        "8": ["#f6e389", "#f8cd79", "#f8b76d", "#f6a067", "#f18a66", "#e87467", "#dd5f6b", "#cd4c71"],
        "9": ["#f6e389", "#f8d07a", "#f8bc70", "#f7a869", "#f49566", "#ee8166", "#e66e68", "#db5c6c", "#cd4c71"],
    },
    "seq7": {
        "2": ["#f2e9a6", "#344e31"],
        "3": ["#f2e9a6", "#8a9968", "#344e31"],
        "4": ["#f2e9a6", "#abb47c", "#6b8055", "#344e31"],
        "5": ["#f2e9a6", "#bcc186", "#8a9968", "#5d734c", "#344e31"],
        "6": ["#f2e9a6", "#c6c98c", "#9da974", "#778a5c", "#546b46", "#344e31"],
        "7": ["#f2e9a6", "#cdce90", "#abb47c", "#8a9968", "#6b8055", "#4e6643", "#344e31"],
        "8": ["#f2e9a6", "#d3d293", "#b4bb81", "#98a570", "#7c8e60", "#637850", "#4b6340", "#344e31"],
        "9": ["#f2e9a6", "#d6d596", "#bcc186", "#a2ad77", "#8a9968", "#73865a", "#5d734c", "#48603e", "#344e31"],
    },
    "seq8": {
        "2": ["#d2e2a6", "#096b6d"],
        "3": ["#d2e2a6", "#6ba888", "#096b6d"],
        "4": ["#d2e2a6", "#8cbc91", "#4d9480", "#096b6d"],
        "5": ["#d2e2a6", "#9dc596", "#6ba888", "#3e897b", "#096b6d"],
        "6": ["#d2e2a6", "#a7cb98", "#7fb48d", "#599c83", "#358379", "#096b6d"],
        "7": ["#d2e2a6", "#aecf9b", "#8cbc91", "#6ba888", "#4d9480", "#2f7f77", "#096b6d"],
        "8": ["#d2e2a6", "#b3d29c", "#95c193", "#79b08c", "#5e9f85", "#448e7d", "#2a7c76", "#096b6d"],
        "9": ["#d2e2a6", "#b7d49d", "#9dc596", "#84b78f", "#6ba888", "#549982", "#3e897b", "#277a75", "#096b6d"],
    },
    "seq9": {
        "2": ["#ebdbad", "#27859c"],
        "3": ["#ebdbad", "#7eb699", "#27859c"],
        "4": ["#ebdbad", "#a2c39a", "#5ba79b", "#27859c"],
        "5": ["#ebdbad", "#b4ca9c", "#7eb699", "#4b9f9c", "#27859c"],
        "6": ["#ebdbad", "#c0cd9e", "#93be99", "#68ad9a", "#429a9c", "#27859c"],
        "7": ["#ebdbad", "#c7d0a0", "#a2c39a", "#7eb699", "#5ba79b", "#3c979d", "#27859c"],
        "8": ["#ebdbad", "#ccd1a1", "#adc79b", "#8dbc99", "#6eb099", "#51a29b", "#38949d", "#27859c"],
        "9": ["#ebdbad", "#d0d2a3", "#b4ca9c", "#99c099", "#7eb699", "#63ab9a", "#4b9f9c", "#35929d", "#27859c"],
    },
    "seq10": {
        "2": ["#d0f0da", "#274c72"],
        "3": ["#d0f0da", "#609fa8", "#274c72"],
        "4": ["#d0f0da", "#82bab7", "#438398", "#274c72"],
        "5": ["#d0f0da", "#95c8bf", "#609fa8", "#387590", "#274c72"],
        "6": ["#d0f0da", "#a0d0c4", "#74afb1", "#4e8e9f", "#336d8b", "#274c72"],
        "7": ["#d0f0da", "#a8d5c7", "#82bab7", "#609fa8", "#438398", "#306887", "#274c72"],
        "8": ["#d0f0da", "#aed9ca", "#8dc2bb", "#6eabae", "#5393a1", "#3d7b94", "#2e6484", "#274c72"],
        "9": ["#d0f0da", "#b2dccc", "#95c8bf", "#79b3b3", "#609fa8", "#4a8a9c", "#387590", "#2c6182", "#274c72"],
    },
    "seq11": {
        "2": ["#ffcdc6", "#513a8d"],
        "3": ["#f3c0b9", "#bd6f95", "#513a8d"],
        "4": ["#f3c0b9", "#d3899c", "#a15991", "#513a8d"],
        "5": ["#f3c0b9", "#dc96a1", "#bd6f95", "#915090", "#513a8d"],
        "6": ["#f3c0b9", "#e19ea5", "#cb7e99", "#ad6293", "#864a90", "#513a8d"],
        "7": ["#f3c0b9", "#e5a4a8", "#d3899c", "#bd6f95", "#a15991", "#7f478f", "#513a8d"],
        "8": ["#f3c0b9", "#e7a8aa", "#d8909f", "#c77a98", "#b26593", "#985491", "#79458f", "#513a8d"],
        "9": ["#f3c0b9", "#e8abac", "#dc96a1", "#ce829a", "#bd6f95", "#a95e92", "#915090", "#75438f", "#513a8d"],
    },
    "seq12": {
        "2": ["#e9c5ed", "#663b91"],
        "3": ["#e9c5ed", "#aa7dbd", "#663b91"],
        "4": ["#e9c5ed", "#bf94cc", "#9466ae", "#663b91"],
        "5": ["#e9c5ed", "#caa0d4", "#aa7dbd", "#895ba7", "#663b91"],
        "6": ["#e9c5ed", "#d0a7d9", "#b78bc6", "#9d6fb4", "#8255a2", "#663b91"],
        "7": ["#e9c5ed", "#d4acdc", "#bf94cc", "#aa7dbd", "#9466ae", "#7d509f", "#663b91"],
        "8": ["#e9c5ed", "#d7b0df", "#c59bd1", "#b387c4", "#a173b6", "#8e60aa", "#7a4d9d", "#663b91"],
        "9": ["#e9c5ed", "#dab2e1", "#caa0d4", "#ba8ec9", "#aa7dbd", "#996cb2", "#895ba7", "#784b9c", "#663b91"],
    },
    "div1": {
        "2": ["#2b8bab", "#dc565f"],
        "3": ["#2b8bab", "#eff4c8", "#dc565f"],
        "4": ["#2b8bab", "#a4d5b5", "#e8c68b", "#dc565f"],
        "5": ["#2b8bab", "#7fc4b2", "#eff4c8", "#e7ac74", "#dc565f"],
        "6": ["#2b8bab", "#69bab1", "#c2e2ba", "#e9d9a2", "#e79c6a", "#dc565f"],
        "7": ["#2b8bab", "#5cb2b1", "#a4d5b5", "#eff4c8", "#e8c68b", "#e69165", "#dc565f"],
        "8": ["#2b8bab", "#52adb0", "#8fccb3", "#cfe7bd", "#eae1ac", "#e7b87d", "#e58962", "#dc565f"],
        "9": ["#2b8bab", "#4ca9b0", "#7fc4b2", "#b7ddb8", "#eff4c8", "#e9d299", "#e7ac74", "#e58360", "#dc565f"],
    },
    "div2": {
        "2": ["#448480", "#c54b3e"],
        "3": ["#448480", "#f9dd35", "#c54b3e"],
        "4": ["#448480", "#a0b169", "#e9932f", "#c54b3e"],
        "5": ["#448480", "#a0b169", "#f9dd35", "#e9932f", "#c54b3e"],
        "6": ["#448480", "#82a373", "#bec05c", "#f0ac30", "#e07b31", "#c54b3e"],
        "7": ["#448480", "#82a373", "#bec05c", "#f9dd35", "#f0ac30", "#e07b31", "#c54b3e"],
        "8": ["#448480", "#729b77", "#a0b169", "#cdc755", "#f2b830", "#e9932f", "#db6e32", "#c54b3e"],
        "9": ["#448480", "#729b77", "#a0b169", "#cdc755", "#f9dd35", "#f2b830", "#e9932f", "#db6e32", "#c54b3e"],
    },
    "div3": {
        "3": ["#3166aa", "#efefef", "#c73d4b"],
        "4": ["#3166aa", "#b6bfd9", "#eab7b5", "#c73d4b"],
        "5": ["#3166aa", "#98a8cd", "#efefef", "#e49a99", "#c73d4b"],
        "6": ["#3166aa", "#869ac6", "#cdd2e2", "#edcdcc", "#e08989", "#c73d4b"],
        "7": ["#3166aa", "#7a91c1", "#b6bfd9", "#efefef", "#eab7b5", "#dc7d7e", "#c73d4b"],
        "8": ["#3166aa", "#718bbe", "#a5b2d2", "#d7dbe6", "#eed7d6", "#e7a6a5", "#da7576", "#c73d4b"],
        "9": ["#3166aa", "#6a86bc", "#98a8cd", "#c4cbde", "#efefef", "#ecc5c4", "#e49a99", "#d86e71", "#c73d4b"],
    },
    "div4": {
        "2": ["#518646", "#d74528"],
        "3": ["#518646", "#f8dea0", "#d74528"],
        "4": ["#518646", "#a6b26e", "#e8995b", "#d74528"],
        "5": ["#518646", "#a6b26e", "#f8dea0", "#e8995b", "#d74528"],
        "6": ["#518646", "#8ba35d", "#c1c07e", "#eeb072", "#e38042", "#d74528"],
        "7": ["#518646", "#8ba35d", "#c1c07e", "#f8dea0", "#eeb072", "#e38042", "#d74528"],
        "8": ["#518646", "#7d9c56", "#a6b26e", "#cfc887", "#f0bc7e", "#e8995b", "#e07339", "#d74528"],
        "9": ["#518646", "#7d9c56", "#a6b26e", "#cfc887", "#f8dea0", "#f0bc7e", "#e8995b", "#e07339", "#d74528"],
    },
    "div5": {
        "2": ["#59a1a6", "#a67b30"],
        "3": ["#59a1a6", "#f5f5a3", "#a67b30"],
        "4": ["#59a1a6", "#a8cba4", "#cdb769", "#a67b30"],
        "5": ["#59a1a6", "#a8cba4", "#f5f5a3", "#cdb769", "#a67b30"],
        "6": ["#59a1a6", "#8ebda5", "#c2d9a4", "#dacb7c", "#c0a356", "#a67b30"],
        "7": ["#59a1a6", "#8ebda5", "#c2d9a4", "#f5f5a3", "#dacb7c", "#c0a356", "#a67b30"],
        "8": ["#59a1a6", "#81b6a5", "#a8cba4", "#cee0a4", "#e1d685", "#cdb769", "#b9994c", "#a67b30"],
        "9": ["#59a1a6", "#81b6a5", "#a8cba4", "#cee0a4", "#f5f5a3", "#e1d685", "#cdb769", "#b9994c", "#a67b30"],
    },
    "div6": {
        "2": ["#8b4583", "#4a6147"],
        "3": ["#8b4583", "#f9f2bf", "#4a6147"],
        "4": ["#8b4583", "#c29ba1", "#9ea781", "#4a6147"],
        "5": ["#8b4583", "#c29ba1", "#f9f2bf", "#9ea781", "#4a6147"],
        "6": ["#8b4583", "#b07e97", "#d4b8ab", "#bcbf95", "#818f6d", "#4a6147"],
        "7": ["#8b4583", "#b07e97", "#d4b8ab", "#f9f2bf", "#bcbf95", "#818f6d", "#4a6147"],
        "8": ["#8b4583", "#a77092", "#c29ba1", "#ddc6b0", "#cbcc9f", "#9ea781", "#738363", "#4a6147"],
        "9": ["#8b4583", "#a77092", "#c29ba1", "#ddc6b0", "#f9f2bf", "#cbcc9f", "#9ea781", "#738363", "#4a6147"],
    },
    "div7": {
        1: ["#2D3E4C"],
        2: ["#2D3E4C", "#C5D7E0"],
        // 2: ["#D72638", "#007F5F"],
        3: ["#2D3E4C", "#6D96AE", "#C5D7E0"],
        // 3: ["#D72638", "#007F5F", "#F8A100"],
        4: ["#2D3E4C", "#EAAD43", "#6D96AE", "#C5D7E0",],
        // 4: ["#D72638", "#007F5F", "#F8A100", "#38BFA7"],
        5: ["#2D3E4C", "#EAAD43", "#6D96AE", "#F1CA87", "#C5D7E0"],
        // 5: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56"],
        6: ["#2D3E4C", "#EAAD43", "#6D96AE", "#F1CA87", "#C5D7E0", "#FCF6EC"],
        // 6: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044"],
        7: ["#2D3E4C", "#EAAD43", "#AA2E26", "#6D96AE", "#F1CA87", "#C5D7E0", "#FCF6EC"],
        // 7: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93"],
        8: ["#2D3E4C", "#EAAD43", "#AA2E26", "#6D96AE", "#F1CA87", "#DD524C", "#C5D7E0", "#FCF6EC"],
        // 8: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686"],
        9: ["#2D3E4C", "#EAAD43", "#AA2E26", "#6D96AE", "#F1CA87", "#DD524C", "#C5D7E0", "#FCF6EC", "#EA8954"],
        // 9: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73"],
        10: ["#2D3E4C", "#EAAD43", "#AA2E26", "#6D96AE", "#F1CA87", "#DD524C", "#C5D7E0", "#FCF6EC", "#EA8954", "#54B99B"],
        // 10: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5"],
        11: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803"],
        12: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2"],
        13: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A"],
        14: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E"],
        15: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373"],
        16: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373", "#73C2FB"],
        17: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373", "#73C2FB", "#FFDD67"],
        18: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373", "#73C2FB", "#FFDD67", "#845EC2"],
        19: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373", "#73C2FB", "#FFDD67", "#845EC2", "#F96167"],
        20: ["#D72638", "#007F5F", "#F8A100", "#38BFA7", "#8F2D56", "#E2C044", "#6A4C93", "#A8C686", "#FF5D73", "#5296A5", "#CC5803", "#F4B6C2", "#6D597A", "#2E294E", "#D4A373", "#73C2FB", "#FFDD67", "#845EC2", "#F96167", "#4B88A2"]
    },
    "schemeGroups": {
        "sequential": ["seq1", "seq2", "seq3", "seq4", "seq5", "seq6", "seq7", "seq8", "seq9", "seq10", "seq11", "seq12"],
        "singlehue": [],
        "diverging": ["div1", "div2", "div3", "div4", "div5", "div6", "div7"]
    }
}