import { get, isEqual, cloneDeep } from "lodash-es";

export 	async function updateDMSAttrs(data, configs, falcor) {
    let updates = {}
    //console.log('updateDMSAttrs', data, configs)
    for( const attr of Object.keys(data) ) {
        //console.log('updateDMSAttrs 1 attr', attr )
        updates[attr] = []
        let [app,type] = configs[attr].format.split('+')
        // console.log('create requests', app, type, attr)

        const toUpdate = Array.isArray(data[attr]) ?
            data[attr] : [data[attr]]

        // console.log('to Update', toUpdate)
        for (const dU of toUpdate) {
            let d = cloneDeep(dU)
            let id = d?.id || false
            let dirty = d?._dirty || false

            for(const key of ['id', 'ref', 'created_at', 'updated_at', 'created_by', 'updated_by', '_dirty']) {
                delete d[key];
            }

            if(id) {
                // skip saving unchanged sections (no _dirty flag)
                if(!dirty) {
                    updates[attr].push({ref:`${app}+${type}`, id})
                    continue
                }

                await falcor.call(
                    ["dms", "data", "edit"],
                    [app, id, d]
                )
                await falcor.invalidate(['dms', 'data', app, 'byId', id])
                updates[attr].push({ref:`${app}+${type}`, id})
            } else {
                // else create
                // console.log('create dms-format', `${app}+${type}`, d)
                const res = await falcor.call(
                    ["dms", "data", "create"],
                    [app, type, d]
                )
                let newId = Object.keys(res?.json?.dms?.data?.byId || {})
                    .filter(d => d !== "$__path")?.[0] || -1

                if(newId !== -1) {
                    await falcor.invalidate(['dms', 'data', app, 'byId', newId])
                    await falcor.invalidate(['dms', 'data', 'byId', newId])
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

export default updateDMSAttrs