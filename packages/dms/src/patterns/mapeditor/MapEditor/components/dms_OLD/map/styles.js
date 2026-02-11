export
const defaultStyles =  [
    {
        name: "Default",
        style: "https://api.maptiler.com/maps/dataviz/style.json?key=mU28JQ6HchrQdneiq6k9"
    },
    { name: "Satellite",
        style: "https://api.maptiler.com/maps/hybrid/style.json?key=mU28JQ6HchrQdneiq6k9",
    },
    { name: "Streets",
        style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9",
    },
    { name: "Light",
        style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9"
    },
    { name: "Dark",
        style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9"
    },
    {
        name: "Blank",
        style: {
            sources:{},
            version: 8,
            layers: [{
                "id": "background",
                "type": "background",
                "layout": {"visibility": "visible"},
                "paint": {"background-color": 'rgba(208, 208, 206, 0)'}
            }]
        }
    }
]

export const blankStyles = [
    {
        name: "Blank",
        style: {
            sources:{},
            version: 8,
            layers: [{
                "id": "background",
                "type": "background",
                "layout": {"visibility": "visible"},
                "paint": {"background-color": 'rgba(208, 208, 206, 0)'}
            }]
        }
    }
]