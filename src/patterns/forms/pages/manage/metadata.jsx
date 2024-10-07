import React, {useEffect, useState} from "react";
import Layout from '../../ui/avail-layout'
import { FormsContext } from '../../'
import SourcesLayout from "../../components/selector/ComponentRegistry/patternListComponent/layout";


const ManageForm = ({
    adminPath,
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
    apiLoad,
    ...rest
}) => {
    // const {id} = params;
    const { baseUrl, theme, user } = React.useContext(FormsContext) || {}
    const [newItem, setNewItem] = useState(parent);
    useEffect(() => setNewItem(parent), [parent])
    const updateData = (data, attrKey) => {
        apiUpdate({data: {...newItem, ...{[attrKey]: data}}, config: {format}})
    }

    console.log('manage forms /manage_pattern/:id/templates?', manageTemplates, attributes)
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: format.type, href: format.url_slug}}
                       page={{name: 'Metadata', href: `${baseUrl}/manage/metadata`}}>
            <div className={`${theme?.page?.wrapper1}`}>
                <div>
                    <div className={'flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className='w-full max-w-6xl mx-auto'>
                            {Object.keys(attributes)
                                .filter(attr => attr === 'config')
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
                                                manageTemplates={manageTemplates}
                                                placeholder={attributes[attrKey].placeholder}
                                                options={attributes[attrKey].options}
                                                item={newItem}
                                                apiLoad={apiLoad}
                                                {...attributes[attrKey]}
                                                format={format}
                                            />
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>
                </div>
            </div>
        </SourcesLayout>
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