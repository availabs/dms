import React, {useCallback, useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import Spreadsheet from "../../page/components/selector/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router";
import DataWrapper from "../../page/components/selector/dataWrapper";
import {cloneDeep, uniqBy} from "lodash-es";

import {ComponentContext} from "../../page/context";
import {useImmer} from "use-immer";
import {
    RenderFilters
} from "../../page/components/selector/dataWrapper/components/filters/RenderFilters";
import { Controls } from "../../page/components/selector/dataWrapper/components/Controls";
import {ThemeContext} from "../../../ui/useTheme";
const TableView = ({apiUpdate, apiLoad, format, item, params}) => {
    const { baseUrl, pageBaseUrl, user, isUserAuthed } = useContext(FormsContext) || {};
    const {theme} = useContext(ThemeContext) || {};
    const navigate = useNavigate();
    const columns = JSON.parse(item?.config || '{}')?.attributes || [];
    const default_columns = (item.default_columns || item.defaultColumns);
    const [value, setValue] = useImmer({
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
            usePageFilters: false,
            allowDownload: true,
            hideDatasourceSelector: true,
        },
        columns: default_columns?.length ?
            uniqBy(default_columns.map(dc => columns.find(col => col.name === dc.name)).filter(c => c).map(c => ({...c, show: true})), d => d?.name) :
            columns.slice(0, 3).map(c => ({...c, show:true})),
    })

    const saveSettings = useCallback(() => {
        const columns =
            (value?.columns || [])
                .filter(({show}) => show)
                .map(col => ({...col, filters: undefined, group: undefined})); // not including some settings

        apiUpdate({data: {...item, default_columns: columns}, config: {format}});
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
                !item.config || !value?.sourceInfo?.columns?.length ? <div className={'p-1 text-center'}>Please setup metadata.</div> :
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                    <div className={`${theme?.page?.wrapper1} max-w-7xl mx-auto bg-white`}>
                        {
                            isUserAuthed(['update-source']) ?
                                <button className={'w-fit p-1 bg-blue-100 hover:bg-blue-200 text-blue-500 text-sm place-self-end rounded-md'}
                                        onClick={saveSettings}>
                                    Set Default Columns
                                </button> :
                                null
                        }
                        <ComponentContext.Provider value={{
                            state: value, setState: setValue, apiLoad,
                            compType: SpreadSheetCompWithControls.name.toLowerCase(), // should be deprecated
                            controls: SpreadSheetCompWithControls.controls,
                            app: item.app,
                            isActive: true
                        }}>

                            <Controls context={ComponentContext} cms_context={FormsContext}/>
                            <RenderFilters state={value} setState={setValue} apiLoad={apiLoad} isEdit={true} defaultOpen={true} cms_context={FormsContext}/>

                            <DataWrapper.EditComp
                                cms_context={FormsContext}
                                component={SpreadSheetCompWithControls}
                                key={'table-page-spreadsheet'}
                                // onChange={(stringValue) => {setValue(JSON.parse(stringValue))}}
                                size={1}
                                hideSourceSelector={true}
                                apiUpdate={apiUpdate}
                                theme={theme}
                            />
                        </ComponentContext.Provider>
                    </div>
            }

        </SourcesLayout>

    )
}

export default TableView