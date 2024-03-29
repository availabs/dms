import get from "lodash/get";

export async function getMeta({
                                  formsConfig,
                                  // setMetaLookupByViewId,
                                  visibleCols,
                                  pgEnv,
                                  falcor,
                                  geoid
                              }) {
    const metaViewIdLookupCols = formsConfig.attributes?.filter(md => visibleCols.includes(md.name) && md.meta_lookup);
    if (metaViewIdLookupCols?.length) {
        const data =
            await metaViewIdLookupCols.reduce(async (acc, md) => {
                const prev = await acc;
                const metaLookup = typeof md.meta_lookup === 'string' ? JSON.parse(md.meta_lookup) : md.meta_lookup;
                const options = JSON.stringify({
                    aggregatedLen: metaLookup.aggregatedLen,
                    filter: {
                        ...metaLookup?.geoAttribute && {[`substring(${metaLookup.geoAttribute}::text, 1, ${geoid?.toString()?.length})`]: [geoid]},
                        ...(metaLookup?.filter || {})
                    }
                });
                const attributes = metaLookup.attributes;
                const keyAttribute = metaLookup.keyAttribute;

                const lenPath = ['dama', pgEnv, 'viewsbyId', metaLookup.view_id, 'options', options, 'length'];

                const lenRes = await falcor.get(lenPath);
                const len = get(lenRes, ['json', ...lenPath], 0);

                if (!len) return Promise.resolve();

                const dataPath = ['dama', pgEnv, 'viewsbyId', metaLookup.view_id, 'options', options, 'databyIndex'];
                const dataRes = await falcor.get([...dataPath, {from: 0, to: len - 1}, attributes]);
                const data = Object.values(get(dataRes, ['json', ...dataPath], {}))
                    .reduce((acc, d) => {
                        acc[d[keyAttribute]] = attributes.reduce((acc, attr) => {
                            acc[attr] = d[attr]
                            return acc
                        }, {})
                        return acc;
                    }, {})



                return {...prev, ...{[md.name]: data}};
            }, {});
        // setMetaLookupByViewId({...metaLookupByViewId, ...data});

        return data
    }

    return {}
}