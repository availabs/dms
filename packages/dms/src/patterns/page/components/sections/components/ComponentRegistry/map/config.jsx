import React from 'react'
import { MapSection } from './index'
import { buildMapControls } from './settings/controls.jsx'

const getData = async () => {
    return {}
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": [],
    getData,
    controls: buildMapControls,
    "EditComp": props => <MapSection {...props} isEdit={true} />,
    "ViewComp": props => <MapSection {...props} isEdit={false} />
}
