import React, {useCallback, useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import Spreadsheet from "../../page/ui/dataComponents/selector/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router-dom";
import DataWrapper from "../../page/ui/dataComponents/selector/dataWrapper";
import {cloneDeep, uniqBy} from "lodash-es";

const TableView = ({apiUpdate, apiLoad, format, item, params}) => {
    const { baseUrl, pageBaseUrl, theme, user } = useContext(FormsContext) || {};
    const navigate = useNavigate();
    const columns = JSON.parse(item?.config || '{}')?.attributes || [];
    const defaultColumns = item.defaultColumns;
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
            allowDownload: true,
        },
        columns: defaultColumns?.length ?
                    uniqBy(defaultColumns.map(dc => columns.find(col => col.name === dc.name)).filter(c => c).map(c => ({...c, show: true})), d => d?.name) :
                        columns.slice(0, 3).map(c => ({...c, show:true})),
    }))

    const saveSettings = useCallback(() => {
        const columns =
            (JSON.parse(value)?.columns || [])
                .filter(({show}) => show)
                .map(col => ({...col, filters: undefined, group: undefined})); // not including some settings

        apiUpdate({data: {...item, defaultColumns: columns}, config: {format}});
    }, [value]);

    useEffect(() => {
        if(!params.view_id && item?.views?.length){
            const recentView = Math.max(...item.views.map(({id}) => id));
            navigate(`${pageBaseUrl}/${params.id}/table/${recentView}`)
        }
    }, [item.views]);

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    // SpreadSheetCompWithControls.controls.columns.push({
    //     type: 'toggle',
    //     label: 'Show N/A',
    //     key: 'filters',
    //     trueValue: [{type: 'internal', operation: 'filter', values: ['null']}]
    // })
    SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')

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
                        <DataWrapper.EditComp
                            component={SpreadSheetCompWithControls}
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