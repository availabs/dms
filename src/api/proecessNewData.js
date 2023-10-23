import get from "lodash/get";

export async function processNewData (dataCache, activeIdsIntOrStr, filteredIdsLength, app, type, dmsAttrsConfigs,format,falcor) {
    const activeIds = Array.isArray(activeIdsIntOrStr) ? activeIdsIntOrStr.map(id => +id) : activeIdsIntOrStr;
    console.log('activeIds', activeIds)
    let newData = []

    // -----------------------------------------------------------------------------------------------------
    let newDataVals = Object.values(get(
        dataCache,
        ['dms', 'data', 'byId'],
        {}
    ))
    .filter(d => (
        (!filteredIdsLength || activeIds.includes(+d.id)) 
        && d.id 
        && d.app === app 
        && d.type === type
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
    console.log('newData', newData[0], dmsAttrsConfigs)
    let i = 0
    for(const d in newData) { 
        if(activeIds === 'loadAll' || activeIds.includes(+newData[d].id) || i === 0) {
            await loadDmsFormats(newData[d],dmsAttrsConfigs,falcor);
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
    // console.log('activeIds', activeIds, d.id)
   
    console.log('loading subdata',  item)

    let dmsKeys = Object.keys(item)
        .filter(d => Object.keys(dmsAttrsConfigs).includes(d))


    for (const key of dmsKeys) {

        console.log('key', key)

        const dmsFormatRequests = []
        for (let ref of item[key]) {
            if(ref.id) {
                dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
            }
        }

        if(dmsFormatRequests.length > 0) {
            let newData = await falcor.get(...dmsFormatRequests)
            let index = 0
            for (let ref of item[key]) {
                if(ref.id) {
                    //let newData = await falcor.get()
                    dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
                }
            }

            if(dmsFormatRequests.length > 0) {
                let newData = await falcor.get(...dmsFormatRequests)
                let index = 0
                for (let ref of item[key]) {
                    if(ref.id) {
                        let value = get(newData, ['json','dms','data', 'byId', ref.id, 'data'])
                        item[key][index]= {...ref,...value}
                        index += 1
                    }
                }
            }
        }
    }
    console.log('item', item)
}


