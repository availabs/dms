import get from "lodash/get";
import isEqual from "lodash/isEqual";

export 	async function updateDMSAttrs(data, configs, falcor) {
    let updates = {}
    console.log('updateDMSAttrs', data, configs)
    for( const attr of Object.keys(data) ) {
        console.log('updateDMSAttrs 1 attr', attr )
        updates[attr] = []
        let [app,type] = configs[attr]?.format.split('+')
        //console.log('create requests', app, type, attr)

        const toUpdate = Array.isArray(data[attr]) ?
            data[attr] : [data[attr]]

        for (const d of toUpdate) {
            let id = d?.id || false
            if(id) {
                // if id edit
                let currentData = get(
                    falcor.getCache(['dms','data','byId',id, 'data']),
                    ['dms','data','byId',id, 'data','value']
                    ,{}
                )
                // ---
                delete d.ref
                delete d.id
                delete currentData.ref
                delete currentData.id
                // ---
                //console.log(currentData,d)

                if(!isEqual(currentData,d)){
                    console.log('update', id )
                    await falcor.call(
                        ["dms", "data", "edit"],
                        [id, d]
                    )
                    await falcor.invalidate(['dms', 'data', 'byId', id])
                }
                updates[attr].push({ref:`${app}+${type}`, id})
            } else {
                // else create
                console.log('create dms-format', `${app}+${type}`)
                const res = await falcor.call(
                    ["dms", "data", "create"],
                    [app, type, d]
                )
                let newId = Object.keys(res?.json?.dms?.data?.byId || {})
                    .filter(d => d !== "$__path")?.[0] || -1
                console.log(newId)
                if(newId !== -1) {
                    updates[attr].push({ref:`${app}+${type}`, id:newId})
                }
            }
            // to do, handle delete
        }

        // if data isn't array convert it back
        updates[attr] = Array.isArray(data[attr]) ? updates[attr] : updates[attr]?.[0] || ''
    }
    return updates
}