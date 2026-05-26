import { FilterEdit, FilterView } from './FilterComponent'

export default {
    "name": 'Filter',
    "type": 'filter',
    "variables": [],
    useDataSource: true,
    useDataWrapper: true,
    defaultState: {
        filters: { op: 'AND', groups: [] },
        columns: [],
        display: {showAttribution: false},
        externalSource: {}
    },
    controls: {
        columns: [],
        more: [
            {type: 'input', inputType: 'number', label: 'Grid Size', key: 'gridSize', min: 1, max: 5},
            {type: 'select', label: 'Placement', key: 'placement',
                options: [{label: 'stacked', value: 'stacked'}, {label: 'inline', value: 'inline'}]
            },
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
        ]
    },
    "EditComp": FilterEdit,
    "ViewComp": FilterView
}
