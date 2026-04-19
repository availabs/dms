import React from 'react'
import { MapSection } from './index'

const getData = async () => {
    return {}
}

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": [],
    getData,
    "EditComp": props => <MapSection {...props} isEdit={true} />,
    "ViewComp": props => <MapSection {...props} isEdit={false} />
}
