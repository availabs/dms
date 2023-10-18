import get from "lodash/get";

export async function processNewData (dataCache, activeIds, app, type, dmsAttrsConfigs, falcor) {
    let newData = []

    // -----------------------------------------------------------------------------------------------------
    const newDataVals = Object.values(get(
        dataCache,
        ['dms', 'data', 'byId'],
        {}
    ))
        .filter(d => (!activeIds?.length || activeIds.includes(d.id)) && d.id && d.app === app && d.type === type)

    for(const k in newDataVals) {
        // flatten data into single object
        let d = newDataVals[k]
        let out = d?.data?.value || {}

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

        // ----------------------------------------
        // if attrs are dmsformat and have refs
        // load that data
        // to do: make this non-blocking / lazy load
        // ----------------------------------------
        // console.log('activeIds', activeIds, d.id)
        if(activeIds === 'loadAll' || activeIds.includes(+d.id)) {

            let dmsKeys = Object.keys(out)
                .filter(d => Object.keys(dmsAttrsConfigs).includes(d))


            for (const key of dmsKeys) {

                const dmsFormatRequests = []
                for (let ref of out[key]) {
                    if(ref.id) {
                        dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
                    }
                }

                if(dmsFormatRequests.length > 0) {
                    let newData = await falcor.get(...dmsFormatRequests)
                    let index = 0
                    for (let ref of out[key]) {
                        if(ref.id) {
                            //let newData = await falcor.get()
                            dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
                        }
                    }

                    if(dmsFormatRequests.length > 0) {
                        let newData = await falcor.get(...dmsFormatRequests)
                        let index = 0
                        for (let ref of out[key]) {
                            if(ref.id) {
                                let value = get(newData, ['json','dms','data', 'byId', ref.id, 'data'])
                                out[key][index]= {...ref,...value}
                                index += 1
                            }
                        }
                    }
                }
            }
        }
        newData.push(out)
    }
    return newData
}