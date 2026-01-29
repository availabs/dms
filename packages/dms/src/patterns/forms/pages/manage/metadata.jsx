import React from "react";
import { FormsContext } from '../../siteConfig'
import SourcesLayout from "../../components/patternListComponent/layout";
import FormConfigComp from "./formConfigComp";

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
    manageTemplates = false,
    apiLoad,
    ...rest
}) => {
    // const {id} = params;
    const { baseUrl, pageBaseUrl, theme, user } = React.useContext(FormsContext) || {}

    const updateData = (data, attrKey) => {
        apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
    }

    console.log('manage forms /manage_pattern/:id/templates?', manageTemplates, attributes)
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Metadata', href: `${pageBaseUrl}/${params.id}`}}
                       id={params.id} //page id to use for navigation
        >
            <div className={`${theme?.page?.wrapper1}`}>
                    <div className={'overflow-auto flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className='w-full'>
                            <FormConfigComp
                                value={item?.config}
                                onChange={(v) => {
                                    // setItem({...item, ...{[attrKey]: v}})
                                    updateData(v, 'config')
                                }}
                                manageTemplates={manageTemplates}
                                item={item}
                                apiLoad={apiLoad}
                                {...attributes.config}
                                format={format}
                            />
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