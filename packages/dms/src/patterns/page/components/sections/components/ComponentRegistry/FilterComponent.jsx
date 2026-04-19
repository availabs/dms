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

export const FilterEdit = ({value, onChange}) => {
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

export const FilterView = ({value}) => {
    const {state, setState} = useContext(ComponentContext);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : initialState)
    }, [value]);

    return (<></>)
}

FilterEdit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}