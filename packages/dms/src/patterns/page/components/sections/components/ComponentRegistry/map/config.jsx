import React from 'react'
import { MapSection } from './index'
import { mapControls } from './settings/controls.jsx'

const getData = async () => {
    return {}
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": [],
    getData,
    controls: mapControls,
    "EditComp": props => <MapSection {...props} isEdit={true} />,
    "ViewComp": props => <MapSection {...props} isEdit={false} />
}
