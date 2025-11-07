import React, {useContext, useEffect, useMemo, useState} from "react";
import { DatasetsContext } from '../../../context'
import SourcesLayout from "../../layout";
import {useNavigate} from "react-router";
import {AuthContext} from "../../../../auth/context";
import {ThemeContext} from "../../../../../ui/useTheme";
import {getSourceData, isJson} from "./utils";
import Map from "./Map"

export default function Table ({source, params}) {
    const navigate = useNavigate();
    const { pageBaseUrl } = useContext(DatasetsContext) || {};

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/map/${recentView}`)
        }
    }, [source.views]);

    return !params.view_id || params.view_id === 'undefined' ? 'Please select a version' : <Map params={params} source={source} views={source.views} />
}