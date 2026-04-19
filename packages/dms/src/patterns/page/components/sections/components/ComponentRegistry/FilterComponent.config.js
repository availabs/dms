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
        display: {},
        externalSource: {}
    },
    controls: {
        columns: [{type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}],
            onChange: ({key, value, attribute, state, columnIdx}) => {
                state.columns[columnIdx].show = Boolean(value?.length);
            }}],
        more: [
            {type: 'input', inputType: 'number', label: 'Grid Size', key: 'gridSize', min: 1, max: 5},
            {type: 'select', label: 'Placement', key: 'placement',
                options: [{label: 'stacked', value: 'stacked'}, {label: 'inline', value: 'inline'}]
            },
        ]
    },
    "EditComp": FilterEdit,
    "ViewComp": FilterView
}
