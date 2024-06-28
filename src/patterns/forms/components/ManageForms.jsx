import React, {useEffect, useState} from "react";

const ManageForm = ({
    status,
    apiUpdate,
    attributes,
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    user,
    params,
    submit,
    manageTemplates = false,
    ...rest
}) => {
    // const {id} = params;
    const [newItem, setNewItem] = useState(item);
    useEffect(() => setNewItem(item), [item])
    const updateData = (data, attrKey) => {
        apiUpdate({data: {...newItem, ...{[attrKey]: data}}, config: {format}})
    }
    //console.log('manage forms /manage_pattern/:id/templates?', manageTemplates, attributes, item)
    return <div key={item.id} className={'w-full'}>
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