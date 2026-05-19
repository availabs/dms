import React from 'react'
import { MapSection } from './index'
import { MapControls } from './settings/controls.jsx'

const getData = async () => {
    return {}
}

export const componentFunctions = {
    providers: [
        {
            id: 'hover_publish',
            label: 'Hover: Publish Feature Value',
            description: 'On hover, publishes a feature field value to a page action param. Clears on hover end.',
            trigger: 'hover',
            args: [
                { key: 'layerId', label: 'Layer', type: 'select', options: { stateKey: 'interactionOptions.mapLayers' } },
                { key: 'field', label: 'Feature Field', type: 'input', inputType: 'text' },
            ],
        },
        {
            id: 'click_publish',
            label: 'Click: Publish Feature Value',
            description: 'On click, publishes a feature field value to a page action param.',
            trigger: 'click',
            args: [
                { key: 'layerId', label: 'Layer', type: 'select', options: { stateKey: 'interactionOptions.mapLayers' } },
                { key: 'field', label: 'Feature Field', type: 'input', inputType: 'text' },
            ],
        },
    ],
    subscribers: [
        {
            id: 'hover_highlight',
            label: 'Highlight Feature On Hover',
            description: 'Highlights matching features on the selected map layer when a shared hover action param changes.',
            trigger: 'action_param',
            args: [
                { key: 'layerId', label: 'Layer', type: 'select', options: { stateKey: 'interactionOptions.mapLayers' } },
                { key: 'field', label: 'Feature Field', type: 'input', inputType: 'text' },
            ],
        },
        {
            id: 'click_highlight',
            label: 'Highlight Feature On Click',
            description: 'Highlights matching features on the selected map layer when a shared click action param changes.',
            trigger: 'action_param',
            args: [
                { key: 'layerId', label: 'Layer', type: 'select', options: { stateKey: 'interactionOptions.mapLayers' } },
                { key: 'field', label: 'Feature Field', type: 'input', inputType: 'text' },
            ],
        },
    ],
};

export default {
    "name": 'Map',
    "type": 'Map',
    "variables": [],
    getData,
    componentFunctions,
    controls: MapControls,
    "EditComp": props => <MapSection {...props} isEdit={true} />,
    "ViewComp": props => <MapSection {...props} isEdit={false} />
}
