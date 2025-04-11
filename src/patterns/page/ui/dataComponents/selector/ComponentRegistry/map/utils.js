import {useEffect, useRef} from "react";
import {fnumIndex} from "../../../../../../../../../../pages/DataManager/MapEditor/components/LayerEditor/datamaps";

export const usePrevious = (value) => {
    const ref = useRef();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};

export const categoricalColors = {
    "cat1": [
        'rgb(107, 184, 199)',
        'rgb(229, 102, 102)',
        'rgb(172, 114, 165)',
        'rgb(114, 172, 120)',
        'rgb(234, 147, 97)',
        'rgb(166, 140, 217)',
        'rgb(237, 190, 94)',
        'rgb(103, 203, 148)',
        'rgb(209, 152, 77)',
        'rgb(168, 169, 96)',
    ],
    "cat2":[
        'rgb(234, 147, 97)',
        'rgb(136, 154, 221)',
        'rgb(198, 150, 88)',
        'rgb(139, 193, 168)',
        'rgb(225, 184, 81)',
        'rgb(206, 126, 168)',
        'rgb(184, 203, 128)',
        'rgb(152, 135, 196)',
        'rgb(223, 215, 129)',
        'rgb(148, 209, 152)'
    ],
    "cat3":[
        'rgb(119, 170, 221)',
        'rgb(238, 136, 102)',
        'rgb(238, 221, 136)',
        'rgb(255, 170, 187)',
        'rgb(153, 221, 255)',
        'rgb(68, 187, 153)',
        'rgb(187, 204, 51)',
        'rgb(112, 128, 207)',
        'rgb(170, 170, 0)',
        'rgb(170, 68, 153)'
    ],
    "cat4":[
        'rgb(155, 201, 69)',
        'rgb(138, 81, 158)',
        'rgb(228, 136, 7)',
        'rgb(195, 75, 143)',
        'rgb(46, 137, 194)',
        'rgb(60, 175, 154)',
        'rgb(249, 122, 113)',
        'rgb(223, 173, 22)',
        'rgb(116, 116, 205)',
        'rgb(179, 136, 86)'
    ],
    "cat5":[
        'rgb(92, 107, 192)',
        'rgb(255, 167, 38)',
        'rgb(236, 64, 122)',
        'rgb(66, 165, 245)',
        'rgb(255, 112, 67)',
        'rgb(102, 187, 106)',
        'rgb(255, 213, 79)',
        'rgb(38, 166, 154)',
        'rgb(255, 138, 101)',
        'rgb(126, 87, 194)'
    ],
    "cat6":[
        'rgb(204, 102, 119)',
        'rgb(51, 34, 136)',
        'rgb(221, 204, 119)',
        'rgb(17, 119, 51)',
        'rgb(136, 204, 238)',
        'rgb(136, 34, 85)',
        'rgb(68, 170, 153)',
        'rgb(153, 153, 51)',
        'rgb(170, 68, 153)',
        'rgb(238, 119, 51)'
    ],
    "cat7": [
        'rgb(129, 144, 71)',
        'rgb(93, 106, 42)',
        'rgb(172, 114, 165)',
        'rgb(107, 71, 128)',
        'rgb(114, 127, 192)',
        'rgb(76, 89, 154)',
        'rgb(179, 126, 117)',
        'rgb(141, 87, 78)',
        'rgb(166, 140, 43)',
        'rgb(76, 141, 154)'
    ],
    "cat8": [
        'rgb(255, 115, 87)',
        'rgb(255, 142, 66)',
        'rgb(255, 173, 41)',
        'rgb(249, 203, 21)',
        'rgb(147, 208, 83)',
        'rgb(40, 189, 140)',
        'rgb(7, 166, 171)',
        'rgb(64, 142, 191)',
        'rgb(107, 127, 184)',
        'rgb(138, 111, 165)'
    ],
    "cat9": [
        'rgb(201, 63, 54)',
        'rgb(219, 96, 51)',
        'rgb(233, 125, 43)',
        'rgb(242, 154, 38)',
        'rgb(248, 187, 42)',
        'rgb(191, 202, 88)',
        'rgb(139, 179, 111)',
        'rgb(103, 158, 125)',
        'rgb(69, 130, 124)',
        'rgb(40, 109, 128)'
    ]
}

export function isValidCategoryPaint(paint) {
    let valid = typeof paint === 'object' && Array.isArray(paint)
    if(!valid) {
        return valid
    }
    paint.forEach(cat => {
        if(!cat || cat === 'undefined') {
            valid = false
        }
    })
    return valid
}

export function choroplethPaint( column, max, colors, num=10, method='ckmeans',colorBreaks, showOther, legendOrientation="vertical"  ) {
    //console.log('paint method', method)
    let paint = [
        'step',
        ["to-number", ['get', column]],
    ];

    let domain = colorBreaks;

    if(!Array.isArray(domain) || domain.length  === 0){
        return false
    }



    domain.forEach((d,i) => {
        paint.push(colors[i]);
        paint.push(+d)
    })

    paint.push(colors[num-1])

    const legend = [
        ...(paint || [])
            .filter((d, i) => i > 2)
            .map((d, i) => {
                if (i % 2 === 1) {
                    //console.log('test', fnumIndex(paint[i+4] || max))
                    let label = '';

                    if(legendOrientation === "vertical") {
                        label = `${
                            paint[i + 2] > 1000 ? fnumIndex(paint[i + 2]) : paint[i + 2]
                        } - ${
                            paint[i + 2] > 1000 || paint[i + 4] > 1000
                                ? fnumIndex(paint[i + 4] || max)
                                : paint[i + 4] || max
                        }`;
                    } else if (legendOrientation = "horizontal") {
                        label = `${paint[i + 2] > 1000 ? fnumIndex(paint[i + 2]) : paint[i + 2]}`;
                    }

                    return {
                        color: paint[i + 1],
                        label,
                    };
                }
                return null;
            })
            .filter((d) => d),
    ];

    return { paint:["case", ["==", ['get', column], null], showOther, paint] , legend }

}

export const CollectionAttributes = {
    collection_id: "collection_id",
    name: "name",
    description: "description",
    metadata: "metadata",
    categories: "categories",
    source_dependencies: "source_dependencies",
    user_id: "user_id",
    _created_timestamp: "_created_timestamp",
    _modified_timestamp: "_modified_timestamp",
};

export const SymbologyAttributes = {
    symbology_id: "symbology_id",
    name: "name",
    collection_id: "collection_id",
    description: "description",
    // metadata: "metadata",
    symbology: "symbology",
    // source_dependencies: "source_dependencies",
    categories: "categories",
    _created_timestamp: "_created_timestamp",
    _modified_timestamp: "_modified_timestamp",
};

export const getAttributes = (data) => {
    return Object.entries(data || {}).reduce((out, attr) => {
        const [k, v] = attr;
        typeof v.value !== "undefined" ? (out[k] = v.value) : (out[k] = v);
        return out;
    }, {});
};
