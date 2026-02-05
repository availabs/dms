import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import { ComponentContext } from "../../../../context";

const initialState = {
    columns: [], // {name, filters: []}
    display: {
        usePageFilters: false,
    },
    sourceInfo: {
        columns: [],
        // pgEnv,
        // source_id
        // view_id
        // version,
        // doc_type, type -- should be the same
    }
}

const Edit = ({value, onChange}) => {
    const isEdit = Boolean(onChange);
    const {state} = useContext(ComponentContext);
    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    return (<></>)
}

const View = ({value}) => {
    const {state, setState} = useContext(ComponentContext);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : initialState)
    }, [value]);

    return (<></>)
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export default {
    "name": 'Filter',
    "type": 'filter',
    "variables": [],
    useDataSource: true,
    defaultState: {
        dataRequest: {},
        columns:[],
        display: {},
        sourceInfo: {}
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
    "EditComp": Edit,
    "ViewComp": View
}