import React from 'react'
import { MapSection } from './index'
import { MapControls } from './settings/controls.jsx'

const getData = async () => {
    return {}
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": [],
    getData,
    controls: MapControls,
    "EditComp": props => <MapSection {...props} isEdit={true} />,
    "ViewComp": props => <MapSection {...props} isEdit={false} />
}
