import { UploadEdit, UploadView } from './UploadComponent'

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
    "name": 'Upload',
    "type": 'upload',
    defaultState,
    useDataSource: true,
    useDataWrapper: true,
    "variables": [],
    "EditComp": UploadEdit,
    "ViewComp": UploadView
}
