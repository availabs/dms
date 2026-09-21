import { get, cloneDeep, merge } from "lodash-es";

export async function processNewData (dataCache, activeIdsIntOrStr, stopFullDataLoad, filteredIdsLength, app, type, dmsAttrsConfigs,format,falcor) {

// console.log("processNewData::format", format);

    const activeIds = Array.isArray(activeIdsIntOrStr) ? activeIdsIntOrStr.map(id => +id) : activeIdsIntOrStr;
    // console.log('activeIds', activeIds)
    let newData = []

    // Merge both cache paths — the production server uses legacy $refs
    // (dms.data.byId) while the new server uses app-namespaced $refs
    // (dms.data[app].byId). After edit/create calls, items can be split
    // across both paths. Merging ensures we see all items regardless of
    // which server is in use. App-namespaced entries take precedence.
    const appByIdCache = get(dataCache, ['dms', 'data', app, 'byId'], {});
    const legacyByIdCache = get(dataCache, ['dms', 'data', 'byId'], {});
    let byIdCache = { ...legacyByIdCache, ...appByIdCache };

  const dataByApp = Object.keys(appByIdCache).length > 0
  //console.log('processNewData - dataByApp', dataByApp)

  let newDataVals = Object.values(byIdCache)
    .filter(d => (
        (stopFullDataLoad ? activeIds?.length && activeIds.includes(+d.id) : true) &&
        d.id &&
        d.app === app &&
        (d.type === type || activeIds.includes(+d.id))
    ))
    const attrHash = format.attributes.reduce((out,curr) => {
        out[curr.key] = curr;
        return out
    },{})

    for(const k in newDataVals) {
        // flatten data into single object
        let d = cloneDeep(newDataVals[k])
        let out = d?.data?.value || {}
        //console.log('hola', k, out, newDataVals)


        Object.keys(d)
            .filter(k => k !== 'data')
            .forEach(col => {
                if(col.includes('data ->> ')){
                    let attr = col.split('->>')[1].trim().replace(/[']/g, '')
                    let val = d[col]
                    // handles JSON TYPE
                  if (attrHash[attr]?.type === 'json' && typeof val !== 'object') {
                      try {
                        val = JSON.parse(val) || {}
                      } catch (e) {
                        //console.warn('cannot parse val', val, '|',  attr,'|', col)
                      }
                    }
                    out[attr] = val
                } else {
                    // console.log('testing', d, col, d[col])
                    out[col] = d[col]
                }

            })

        newData.push(out);

    }
    if(format?.defaultSort) {
        newData = format.defaultSort(newData)
    }
    let i = 0
    for(const d in newData) {
        if(activeIds === 'loadAll' || activeIds.includes(+newData[d].id) || i === 0) {
            //console.time(`load dms formats ${newData[d].id}`)
            //console.log('load dms data', activeIds, newData[d].id)
            await loadDmsFormats(newData[d],dmsAttrsConfigs, format, falcor, dataByApp);
            //console.timeEnd(`load dms formats ${newData[d].id}`)
        }
        i++;
    }

    return newData
}

export default processNewData

async function loadDmsFormats (item,dmsAttrsConfigs, format, falcor, isDataByApp = false) {
    // ----------------------------------------
    // if attrs are dmsformat and have refs
    // load that data
    // check if the data has dmsformats
    // load that data
    // to do: make this non-blocking / lazy load
    // ----------------------------------------

    if(!item) return;
    //console.log('loadDmsFormats', item)
    let dmsKeys = Object.keys(item)
        .filter(d => Object.keys(dmsAttrsConfigs).includes(d))

    // get the format/attributes of dms types to recurse
    let dmsSubFormats = Object.keys(dmsAttrsConfigs)
        .reduce((out, key) => {
            let fmatch = format?.registerFormats?.filter(f => {
                return f.type === dmsAttrsConfigs[key].format.split('+')[1]
            })?.[0]
            if(fmatch) {
                out[key] = fmatch
            }
            return out
        },{})



    // console.log('loadDmsFormats item:', item.id, item.type , 'dmsKeys', dmsKeys, dmsAttrsConfigs, format, dmsSubFormats)

    for (const key of dmsKeys) {
        const dmsFormatRequests = []
        const subApp = dmsAttrsConfigs[key].format.split('+')[0]
        const byIdAddress  = isDataByApp ?
          ['dms', 'data', subApp, 'byId'] :
          ['dms', 'data', 'byId']

        const dmsSubAttrsConfigs = (Object.values(dmsSubFormats?.[key]?.attributes|| {}))
            //.filter(d => !Array.isArray(filter?.attributes) || filter.attributes.includes(d.key))
            .filter(d => d.type === 'dms-format')
            .reduce((out,curr) => {
                out[curr.key] = curr
                return out
            },{})
        // console.log('key', key, dmsSubFormats)


        if(typeof item?.[key] === 'string') {
            if(item[key] === 'no-access') {
                item[key] = null;
            } else {
                item[key] = JSON.parse(item[key]);
            }
        }
        // Columns to fetch per referenced row. An attribute can opt into a
        // narrower projection with `refAttributes` — e.g. the site format's
        // `theme_refs` asks only for ["data ->> 'name'"], because a theme row's
        // `data` is 100-300 kB and the router only needs to know WHICH theme
        // each ref is before fetching the one a pattern actually selects (see
        // resolveThemes in render/spa/utils). `data ->> 'x'` attributes come
        // back on the path they were requested on, so the key is normalized to
        // `x` here; the default list has no such entries, so it is unchanged.
        const attrsToFetch = dmsAttrsConfigs[key].refAttributes
            || ['data', 'type', 'created_at', 'updated_at', 'created_by', 'updated_by']
        const metaKeyFor = (attr) => attr.includes('data ->> ')
            ? attr.split('->>')[1].trim().replace(/[']/g, '')
            : attr
        if(typeof item?.[key]?.[Symbol.iterator] === 'function') {
            for (let ref of item[key]) {
                if(ref.id) {
                    dmsFormatRequests.push([...byIdAddress, ref.id, attrsToFetch])

                }
            }
        } else if(item[key]?.id) {
            // if dmstype is single
          dmsFormatRequests.push([...byIdAddress, item[key]?.id, attrsToFetch])

        }

        if(dmsFormatRequests.length > 0) {
            let newData;

            try{
                newData = await falcor.get(...dmsFormatRequests)
            }catch (e){
                console.error('Error getting data')
            }

            // if dmstype isArray
            if(typeof item?.[key]?.[Symbol.iterator] === 'function') {
                let index = 0
                for (let ref of item[key]) {
                    if(ref.id) {
                        let value = get(newData, ['json',...byIdAddress, ref.id, 'data'])
                        const meta = attrsToFetch.filter(a => a !== 'data')
                                                     .reduce((acc, attr) => ({...acc, [metaKeyFor(attr)]: get(newData, ['json',...byIdAddress, ref.id, attr])}) , {})

                        // if new item has dms-format data, recursively fetch
                        if(Object.keys(dmsSubAttrsConfigs).length > 0){
                            await loadDmsFormats(value, dmsSubAttrsConfigs, dmsSubFormats[key], falcor)
                        }
                        // `id: ref.id` last is deliberate (the ref's id is the
                        // real row id), but it also ERASES the server's
                        // `data.id = 'no-access'` marker for an auth-blocked row
                        // — which is how a routing stub used to sail past
                        // hasNoAccessPatterns() and get persisted as a site
                        // snapshot, making every later boot render from stub data
                        // (default theme, no `type`) and then remount when the
                        // real fetch landed. Keep the marker on a separate key.
                        item[key][index]= {...ref,...value, ...meta, id: ref.id,
                            ...(value?.id === 'no-access' ? { no_access: true } : {})}
                        index += 1
                    }
                }
            // dmstype not array
            } else {
                let value = get(newData, ['json',...byIdAddress, item[key].id, 'data'])
                const meta = attrsToFetch.filter(a => a !== 'data')
                                             .reduce((acc, attr) => ({...acc, [metaKeyFor(attr)]: get(newData, ['json',...byIdAddress, item[key].id, attr])}) , {})

                item[key] = {...item[key], ...value, ...meta,
                    ...(value?.id === 'no-access' ? { no_access: true } : {})}
            }

        }
    }
    //console.log('item', item)
}
