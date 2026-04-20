import { MapDamaEdit, MapDamaView } from './index'

const getData = async () => {
    return {}
}

export default {
    "name": 'Map: Dama',
    "type": 'Map',
    "variables": [
        {
            name: 'geoid',
            default: '36'
        }
    ],
    getData,
    "EditComp": MapDamaEdit,
    "ViewComp": MapDamaView
}
