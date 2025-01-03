import React, {useEffect, useMemo} from "react";
import { get } from "lodash-es";

import Selector from "./Selector";
import {getAttributes} from './ViewsSelect'

import { CMSContext } from '../../../../siteConfig'

export const SourcesSelect = ({value, onChange}) => {

    const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext)

    useEffect(() => {
        async function fetchData() {
            const lengthPath = ["dama", pgEnv, "sources", "length"];
            const resp = await falcor.get(lengthPath);
            //console.log('length', get(resp.json, lengthPath, 0) - 1)
            const dataResp = await falcor.get([
                "dama", pgEnv, "sources", "byIndex",
                { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
                "attributes", ['source_id', 'name', 'metadata']
            ]);
            // console.log('dataResp', dataResp)
        }

        fetchData();
    }, [falcor, pgEnv]);

    const sources = useMemo(() => {
        //console.log('set sources', falcorCache)
        return Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byIndex"], {}))
            .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
    }, [falcorCache, pgEnv]);

    //console.log('sources select', sources)
    return (
        <Selector
            options={['',...sources]}
            value={value}
            onChange={(v)=> onChange(v) }
        />
    );
};