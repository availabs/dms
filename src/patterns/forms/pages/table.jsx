import React, {useContext, useEffect, useState} from "react";
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
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    const columns = JSON.parse(item?.config || '{}')?.attributes || [];
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
                !item.config ? <div className={'p-1 text-center'}>Please setup metadata.</div> :
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                    <div className={`${theme?.page?.wrapper1} h-full overflow-auto`}>
                        <Spreadsheet.EditComp
                            key={'table-page-spreadsheet'}
                            onChange={() => {
                            }}
                            size={1}
                            format={{
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
                                    pageSize: 10,
                                    loadMoreId: `id-table-page`,
                                    allowSearchParams: false,
                                },
                                columns: columns.slice(0, 5).map(c => ({...c, show:true})),
                            }}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                        />
                    </div>
            }

        </SourcesLayout>

    )
}

export default TableView