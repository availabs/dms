import React, {useEffect, useState} from "react";
import Layout from '../../ui/avail-layout'
import { FormsContext } from '../../'


const ManageForm = ({
    adminPath,
    status,
    apiUpdate,
    attributes={},
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    parent,
    ...rest
}) => {
    // const {id} = params;
    const { baseUrl, theme, user } = React.useContext(FormsContext) || {}
    const [newItem, setNewItem] = useState(parent);
    useEffect(() => setNewItem(parent), [parent])
    const updateData = (data, attrKey) => {
        apiUpdate({data: {...newItem, ...{[attrKey]: data}}, config: {format}})
    }
    
    
    //console.log('manage forms /manage_pattern/:id/templates?', manageTemplates, attributes, item)
    return (
        
        <div className={`${theme?.page?.wrapper2}`}>      
            <div className={theme?.page?.wrapper3}>
                {status ? <div>{JSON.stringify(status)}</div> : ''}
                <div className='w-full max-w-6xl mx-auto'>
                    {Object.keys(attributes)
                        .filter(attr => attr === 'templates')
                        .map((attrKey, i) => {
                            let EditComp = attributes[attrKey].EditComp;
                            //console.log('attrs', attributes[attrKey], newItem)
                            return (
                                <div key={`${attrKey}-${i}`}>
                                    <EditComp
                                        value={newItem?.[attrKey]}
                                        onChange={(v) => {
                                            setNewItem({...newItem, ...{[attrKey]: v}})
                                            updateData(v, attrKey)
                                        }}
                                        format={format}
                                        placeholder={attributes[attrKey].placeholder}
                                        item={newItem}
                                        {...attributes[attrKey]}
                                    />
                                </div>
                            )
                        })
                    }
                </div>
            </div>
        </div>

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