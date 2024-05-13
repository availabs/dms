import {getAccessor, getColAccessor} from "./getColAccesor";
import {getMeta} from "./getMeta";
import {setMeta} from "./setMeta";
import {dmsDataLoader} from "~/modules/dms/src"

export async function getData({
  formsConfig,
  actionType,
  metaLookupByViewId,
  setMetaLookupByViewId,
  visibleCols,
  pgEnv,
  geoid,
  geoAttribute,
  pageSize, sortBy, groupBy, fn, notNull, colSizes,
  filters, filterValue, hiddenCols, setData
}, falcor) {
    await getMeta({
        formsConfig: formsConfig,
        metaLookupByViewId,
        setMetaLookupByViewId,
        visibleCols,
        pgEnv,
        falcor,
        geoid
    });
    console.log('')
    const d = await dmsDataLoader(
        falcor,
        {
            format: formsConfig,
            children: [
                {
                    type: () => {
                    },
                    action: 'load',
                    path: '/0/250',
                    filter: {
                        // fromIndex: path => path.split('/')[1],
                        // toIndex: path => path.split('/')[2],
                        options: JSON.stringify({
                            aggregatedLen: groupBy?.length,
                            // filter: {
                            //     ...form === 'Actions' && actionType && {[`data->>'idKey'`]: [actionType]}
                            // },
                            exclude: {
                                ...notNull.length &&
                                notNull.reduce((acc, col) => (
                                    {...acc,
                                        [
                                            formsConfig?.attributes?.find(attr =>
                                                attr.name.toLowerCase().split(' as ')[0] === col.toLowerCase())?.origin === 'calculated-column' ? col :
                                                `${getAccessor(col)}'${col}'`
                                            ]:
                                            ['number', 'integer'].includes(formsConfig?.attributes?.find(attr => attr.name.toLowerCase().split(' as ')[0] === col.toLowerCase())?.type) ? ['null'] : ['null', '', ' ']}) , {}) // , '', ' ' error out for numeric columns.
                            },
                            groupBy: groupBy.map(gb => formsConfig?.attributes?.find(attr => attr.name.toLowerCase().split(' as ')[0] === gb.toLowerCase())?.origin === 'calculated-column' ? gb : `${getAccessor(gb)}'${gb}'`)
                        }),
                        attributes: ['id', ...visibleCols.map(vc => getColAccessor(fn, vc, formsConfig?.attributes?.find(attr => attr.name === vc)?.origin))]
                        // using id to get to view and edit pages. can't group now.
                    },
                }
            ]
        },
        '/0/250'
    );

    const data = await setMeta({
        formsConfig: formsConfig,
        visibleCols,
        data: d,
        metaLookupByViewId,
        geoAttribute, geoid, actionType, fn
    })
    setData && setData(data)
    return data;
}