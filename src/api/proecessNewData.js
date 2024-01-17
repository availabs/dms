import get from "lodash/get";

export async function processNewData (dataCache, activeIdsIntOrStr, filteredIdsLength, app, type, dmsAttrsConfigs,format,falcor) {
    const activeIds = Array.isArray(activeIdsIntOrStr) ? activeIdsIntOrStr.map(id => +id) : activeIdsIntOrStr;
    // console.log('activeIds', activeIds)
    let newData = []

    // -----------------------------------------------------------------------------------------------------
    let newDataVals = Object.values(get(
        dataCache,
        ['dms', 'data', 'byId'],
        {}
    ))
    .filter(d => (
        //(!filteredIdsLength || activeIds.includes(+d.id)) && 
        d.id &&
        d.app === app &&
        d.type === type
    ))
    
    
    for(const k in newDataVals) {
        // flatten data into single object
        let d = newDataVals[k]
        let out = d?.data?.value || {}
        //console.log('hola', k, out, i)

        Object.keys(d)
            .filter(k => k !== 'data')
            .forEach(col => {
                if(col.includes('data ->> ')){
                    let attr = col.split('->>')[1].trim().replace(/[']/g, '')
                    out[attr] = d[col]
                } else {
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
            await loadDmsFormats(newData[d],dmsAttrsConfigs,falcor);
            //console.timeEnd(`load dms formats ${newData[d].id}`)
        }
        i++;
    }
    
    return newData
}


async function loadDmsFormats (item,dmsAttrsConfigs,falcor) {

    // ----------------------------------------
    // if attrs are dmsformat and have refs
    // load that data
    // to do: make this non-blocking / lazy load
    // ----------------------------------------

    let dmsKeys = Object.keys(item)
        .filter(d => Object.keys(dmsAttrsConfigs).includes(d))


    for (const key of dmsKeys) {
        const dmsFormatRequests = []
        // if dmstype isArray
        if(typeof item?.[key]?.[Symbol.iterator] === 'function') {
            for (let ref of item[key]) {
                if(ref.id) {
                    dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
                }
            }
        } else {
            // if dmstype is single
            dmsFormatRequests.push(['dms','data', 'byId', item[key].id, 'data'])
        }

        if(dmsFormatRequests.length > 0) {
            let newData = await falcor.get(...dmsFormatRequests)
            // console.log('testing dmsFormatRequests', newData)
            // if dmstype isArray
            if(typeof item?.[key]?.[Symbol.iterator] === 'function') {
                let index = 0
                for (let ref of item[key]) {
                    if(ref.id) {
                        let value = get(newData, ['json','dms','data', 'byId', ref.id, 'data'])
                        item[key][index]= {...ref,...value}
                        index += 1
                    }
                }
            // dmstype not array
            } else {
                let value = get(newData, ['json','dms','data', 'byId', item[key].id, 'data'])
                item[key] = {...item[key], ...value}
            }
            
        }
    }
    //console.log('item', item)
}


