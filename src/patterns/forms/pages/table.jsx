import React, {useCallback, useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../components/selector/ComponentRegistry/spreadsheet";

const TableView = ({
    adminPath,
    status,
    apiUpdate,
    apiLoad,
    attributes={},
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    parent,
    manageTemplates = false,
    // ...rest
}) => {
    const { API_HOST, baseUrl, pageBaseUrl, theme, user } = React.useContext(FormsContext) || {};
    const columns = JSON.parse(item?.config || '{}')?.attributes || [];
    const [value, setValue] = useState(JSON.stringify({
        dataRequest: {},
        data: [],
        sourceInfo: {
            app: item.app,
            type: `${item.doc_type}-${params.view_id}`,
            env: `${item.app}+${item.doc_type}`,
            doc_type: `${item.doc_type}-${params.view_id}`,
            isDms: true,
            originalDocType: item.doc_type,
            view_id: params.view_id,
            columns
        },
        display: {
            usePagination: false,
            pageSize: 1000,
            loadMoreId: `id-table-page`,
            allowSearchParams: false,
        },
        columns: columns.find(({defaultShow}) => defaultShow) ?
                    columns.filter(({defaultShow}) => defaultShow).map(c => ({...c, show: true})) :
                        columns.slice(0, 3).map(c => ({...c, show:true})),
    }))

    const saveSettings = useCallback(() => {
        const columns = (JSON.parse(value)?.columns || []).filter(({show}) => show).map(({name}) => name);
        const newConfig = JSON.parse(item.config || '{}');
        newConfig.attributes = newConfig.attributes.map(attr => ({...attr, defaultShow: columns.includes(attr.name)}) )
        apiUpdate({data: {...item, config: JSON.stringify(newConfig)}, config: {format}});
    }, [value]);
    console.log('value', JSON.parse(value))
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Table', href: `${pageBaseUrl}/${params.id}/table`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={item.views}
                       showVersionSelector={true}
        >
            {
                !item.config || !JSON.parse(value)?.sourceInfo?.columns?.length ? <div className={'p-1 text-center'}>Please setup metadata.</div> :
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                    <div className={`${theme?.page?.wrapper1}`}>
                        {
                            user.authLevel >= 10 ?
                                <button className={'w-fit p-1 bg-blue-100 hover:bg-blue-200 text-blue-500 text-sm place-self-end rounded-md'}
                                        onClick={saveSettings}>
                                    Set Default Columns
                                </button> :
                                null
                        }
                        <Spreadsheet.EditComp
                            key={'table-page-spreadsheet'}
                            value={value}
                            onChange={(stringValue) => {setValue(stringValue)}}
                            size={1}
                            hideSourceSelector={true}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                        />
                    </div>
            }

        </SourcesLayout>

    )
}

export default TableView