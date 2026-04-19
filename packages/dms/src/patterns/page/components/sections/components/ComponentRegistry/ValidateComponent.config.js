import { ValidateEdit, ValidateView } from './ValidateComponent'

const defaultState = {
    columns: [],
    display: {
        usePageFilters: false,
    },
    externalSource: {
        columns: [],
    }
}

export default {
    "name": 'Validate',
    "type": 'Validate',
    defaultState,
    useDataSource: true,
    useDataWrapper: true,
    "variables": [],
    "EditComp": ValidateEdit,
    "ViewComp": ValidateView
}
