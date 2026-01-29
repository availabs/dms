import React, {useContext, useEffect} from "react";
import { DatasetsContext } from '../../../../../context'
import {useNavigate} from "react-router";
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