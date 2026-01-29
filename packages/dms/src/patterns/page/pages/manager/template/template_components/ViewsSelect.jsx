import React, {useEffect, useMemo, useState} from "react";
import { get } from "lodash-es"

import { CMSContext } from '../../../../context'
import TemplateSelector from "./TemplateSelector";
import { getExternalEnv } from '../../../../pages/_utils/datasources'

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

    const { falcor, falcorCache, datasources} = React.useContext(CMSContext)
    const pgEnv = getExternalEnv(datasources);
    const [views, setViews] = useState([]);
    useEffect(() => {
        async function fetchData() {
            if (!pgEnv) return;
            const lengthPath = ["dama", pgEnv, "sources", "byId", source_id, "views", "length"];;
            const resp = await falcor.get(lengthPath);
            await falcor.get([
                "dama", pgEnv, "sources", "byId", source_id, "views", "byIndex",
                { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
                "attributes", ['view_id', 'version']
            ]);

            const falcorCache = falcor.getCache();
            const views = Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byId", source_id, "views", "byIndex"], {}))
                .map(v => get(falcorCache, v.value)?.attributes)
            setViews(views)
        }

        fetchData();
    }, [falcor, pgEnv]);

    useEffect(() => {
        if(!value && views?.[0]?.view_id) {
            onChange(views?.[0])
        }
    },[views])



    // console.log('sources select', views)
    return (
        <TemplateSelector
            options={['',...views]}
            value={value}
            nameAccessor={d => d?.version }
            onChange={(v)=> onChange(v) }
        />
    );
};