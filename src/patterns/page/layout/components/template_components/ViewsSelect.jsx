import React, {useEffect, useMemo} from "react";
import get from "lodash/get.js";

import { CMSContext } from '../../../siteConfig'
import Selector from "./Selector.jsx";
import {pgEnv} from "../utils/constants.js";

export const getAttributes = (data) => {
  return Object.entries(data || {})
    .reduce((out,attr) => {
      const [k,v] = attr
      typeof v.value !== 'undefined' ? 
        out[k] = v.value : 
        out[k] = v
      return out 
    },{})
}

export const ViewsSelect = ({source_id, value, onChange}) => {

    const { falcor, falcorCache} = React.useContext(CMSContext)

    useEffect(() => {
        async function fetchData() {
            const lengthPath = ["dama", pgEnv, "sources", "byId", source_id, "views", "length"];;
            const resp = await falcor.get(lengthPath);
            // console.log('length', get(resp.json, lengthPath, 0) - 1)
            const dataResp = await falcor.get([
                "dama", pgEnv, "sources", "byId", source_id, "views", "byIndex",
                { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
                "attributes", ['view_id', 'version']
            ]);
            //console.log('dataResp', dataResp)
        }

        fetchData();
    }, [falcor, pgEnv]);

    const views = useMemo(() => {
        return Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byId", source_id, "views", "byIndex"], {}))
            .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
    }, [falcorCache, source_id, pgEnv]);


    useEffect(() => {
        if(!value && views?.[0]?.view_id) {
            onChange(views?.[0])
        }
    },[views])



    // console.log('sources select', views)
    return (
        <Selector
            options={['',...views]}
            value={value}
            nameAccessor={d => d?.version }
            onChange={(v)=> onChange(v) }
        />
    );
};