import React, {useEffect, useState} from "react";
import Layout from '../ui/avail-layout'
import { FormsContext } from '../'


const ManageForm = ({
    status,
    apiUpdate,
    attributes,
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    parent,
    manageTemplates = false,
    ...rest
}) => {
    // const {id} = params;
    const { baseUrl, theme, user } = React.useContext(FormsContext) || {}
    console.log('ManageForm', item, parent, dataItems)
    const [newItem, setNewItem] = useState(item);
    useEffect(() => setNewItem(item), [item])
    const updateData = (data, attrKey) => {
        apiUpdate({data: {...newItem, ...{[attrKey]: data}}, config: {format}})
    }
    //console.log('manage forms /manage_pattern/:id/templates?', manageTemplates, attributes, item)
    return (
        <Layout>
            <div className={`${theme?.page?.wrapper1}`}>
                <div className={`${theme?.page?.wrapper2}`}>      
                    <div className={theme?.page?.wrapper3}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}

                        {Object.keys(attributes)
                            .filter(attr => manageTemplates ? attr === 'templates' : attr !== 'templates')
                            .map((attrKey, i) => {
                                let EditComp = attributes[attrKey].EditComp;
                                //console.log('attrs', attributes[attrKey], newItem)
                                return (
                                    <div key={`${attrKey}-${i}`}>
                                        <EditComp
                                            key={`${attrKey}-${i}`}
                                            value={newItem?.[attrKey]}
                                            onChange={(v) => {
                                                setNewItem({...newItem, ...{[attrKey]: v}})
                                                updateData(v, attrKey)
                                            }}
                                            format={format}
                                            manageTemplates={manageTemplates}
                                            {...attributes[attrKey]}
                                            item={newItem}
                                        />
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            </div> 
        </Layout>
    )
}

const ViewForm = ({
    status,
    attributes,
    dataItems,
    format,
    item,
    user,
    params,
    submit,
    ...rest
}) => {
    // const {id} = params;

    return <div key={item.id} className={'w-full'}>
        {Object.keys(attributes)
            .map((attrKey, i) => {
                let ViewComp = attributes[attrKey].ViewComp;
                return (
                    <div key={`${attrKey}-${i}`}>
                        <ViewComp
                            key={`${attrKey}-${i}`}
                            value={item?.[attrKey]}
                            format={format}
                            {...attributes[attrKey]}
                        />
                    </div>
                )
            })
        }
    </div>
}

export default {
    "EditComp": ManageForm,
    "ViewComp": ViewForm
}