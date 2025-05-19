import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import {ComponentContext} from "~/modules/dms/src/patterns/page/siteConfig";

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
    controls: {
        columns: [{type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]}]
    },
    "EditComp": Edit,
    "ViewComp": View
}