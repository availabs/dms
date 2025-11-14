import React, {useEffect} from "react"
import {AdminContext} from "../context";
import AdminLayout from "./layout";
import {isEqual} from "lodash-es";
import {PatternFilterEditor} from "../components/PatternFilterEditor";
import {PatternPermissionsEditor} from "../components/PatternPermissionsEditor";

export default ({params, item, format, apiUpdate, attributes}) => {
    const {baseUrl, UI, user} = React.useContext(AdminContext);
    const [tmpItem, setTmpItem] = React.useState(item);
    const {pattern_id, page='overview'} = params;
    const {Button} = UI;
    const attrs = {
        overview: ['pattern_type', 'name', 'subdomain', 'base_url'],
        filters: ['filters'],
        permissions: ['authPermissions'],
    }
    if(!user?.authed) return <div>Please login to view this page</div>

    useEffect(() => {
        if(!isEqual(item, tmpItem)) setTmpItem(item);
    }, [item]);

    const updateData = () => {
        apiUpdate({data: tmpItem, config: {format}})
    }
    console.log('value', item)
    return (
        <AdminLayout id={pattern_id}
                     page={{name: page}}
                     baseUrl={baseUrl}
                     pattern={item}
        >
            {
                (attrs[page] || []).map((attrKey, i) => {
                    let {EditComp, ViewComp, ...props} = attributes[attrKey]
                    if(attrKey === 'filters'){
                        EditComp = PatternFilterEditor
                    }
                    if(attrKey === 'authPermissions'){
                        EditComp = PatternPermissionsEditor
                    }
                    return (
                        <EditComp
                            value={tmpItem?.[attrKey]}
                            onChange={(v) => setTmpItem({...tmpItem, [attrKey]: v})}
                            placeHolder={attrKey}
                            {...props}
                            key={`${attrKey}-${i}`}
                            user={user}
                            UI={UI}
                        />

                    )
                })
            }

            <div className={'w-full flex items-center justify-start gap-0.5'}>
                <Button
                    className={'bg-blue-100 hover:bg-blue-300 text-sm text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
                    type={'plain'}
                    title={'save item'}
                    onClick={() => {
                        updateData()
                    }}
                >
                    save
                </Button>

                <Button
                    className={'bg-red-100 hover:bg-red-300 text-sm text-red-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
                    type={'plain'}
                    title={'cancel item'}
                    onClick={() => {
                        setTmpItem(item)
                    }}
                >
                    cancel
                </Button>
            </div>
        </AdminLayout>
    )
}