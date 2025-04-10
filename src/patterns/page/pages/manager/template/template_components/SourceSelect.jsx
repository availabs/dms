import React, {useEffect, useMemo, useState} from "react";
import { get } from "lodash-es";
import TemplateSelector from "./TemplateSelector";
import { CMSContext } from '../../../../siteConfig'

export const SourcesSelect = ({value, onChange}) => {

    const { falcor, falcorCache, pgEnv } = React.useContext(CMSContext)
    const [sources, setSources] = useState([]);

    useEffect(() => {
        async function fetchData() {
            const lengthPath = ["dama", pgEnv, "sources", "length"];
            const resp = await falcor.get(lengthPath);
            await falcor.get([
                "dama", pgEnv, "sources", "byIndex",
                { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
                "attributes", ['source_id', 'name', 'metadata']
            ]);
            const falcorCache = falcor.getCache();
            const sources = Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byIndex"], {}))
                .map(v => get(falcorCache, v.value)?.attributes)
            setSources(sources)
        }

        fetchData();
    }, [falcor, pgEnv]);

    return (
        <TemplateSelector
            options={['',...sources]}
            value={value}
            onChange={(v)=> onChange(v) }
        />
    );
};