import React, {useCallback, useContext, useEffect, useMemo, useState} from "react";
import { DatasetsContext } from '../context'
import SourcesLayout from "../components/DatasetsListComponent/layout";
import Spreadsheet from "../../page/components/selector/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router";
import DataWrapper from "../../page/components/selector/dataWrapper";
import {cloneDeep, isEqual, uniqBy} from "lodash-es";
import {AuthContext} from "../../auth/context";
import {ComponentContext} from "../../page/context";
import {useImmer} from "use-immer";
import {
    RenderFilters
} from "../../page/components/selector/dataWrapper/components/filters/RenderFilters";
import { Controls } from "../../page/components/selector/dataWrapper/components/Controls";
import {ThemeContext} from "../../../ui/useTheme";
import {getSourceData, isJson} from "./utils";

export default function Table ({apiUpdate, apiLoad, format, item, params}) {
    const {pgEnv, id, view_id} = params;
    const isDms = pgEnv === 'internal';

    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed } = useContext(DatasetsContext) || {};
    const authContext = useContext(AuthContext) || {};
    console.log('auth context', authContext)
    const [source, setSource] = useState(isDms ? item : {});

    let columns = useMemo(() =>
        isDms ?
            isJson(item.config) ? JSON.parse(item.config)?.attributes : [] :
            (source?.metadata?.columns || []), [item.config, isDms, source?.metadata?.columns])

    const default_columns = (item?.default_columns || item?.defaultColumns) || [];

    useEffect(() => {
        // if(isDms) // use item
        if((!isDms || (isDms && !Object.entries(item).length)) && id && pgEnv){
            // fetch source data
            getSourceData({pgEnv, falcor, source_id: id, setSource});
        }
    }, [isDms, id, pgEnv])

    const [value, setValue] = useImmer({
        dataRequest: {},
        data: [],
        sourceInfo: {},
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

    useEffect(() => {
        const sourceInfo = isDms ? {
            app: item.app,
            type: `${item.doc_type}-${params.view_id}`,
            env: `${item.app}+${item.doc_type}`,
            doc_type: `${item.doc_type}-${params.view_id}`,
            isDms,
            originalDocType: item.doc_type,
            view_id: params.view_id,
            columns
        } : {
            isDms: undefined,
            source_id: +id,
            view_id: +view_id,
            env: pgEnv,
            srcEnv: pgEnv,
            type: undefined,
            columns: source?.metadata?.columns || [],
        };

        const activeColumns = isDms ? undefined : source?.metadata?.columns?.slice(0, 3)?.map(c => ({...c, show:true}));
        setValue(draft => {
            if(!isEqual(draft.sourceInfo, sourceInfo)){
                draft.sourceInfo = sourceInfo;
            }

            if(!isDms && !isEqual(draft.columns, activeColumns)){
                draft.columns = activeColumns;
            }
        })
    }, [source])

    const saveSettings = useCallback(() => {
        const columns =
            (value?.columns || [])
                .filter(({show}) => show)
                .map(col => ({...col, filters: undefined, group: undefined})); // not including some settings

        apiUpdate({data: {...item, default_columns: columns}, config: {format}});
    }, [value]);

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${pgEnv}/${params.id}/table/${recentView}`)
        }
    }, [source.views]);

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    // SpreadSheetCompWithControls.controls.columns.push({
    //     type: 'toggle',
    //     label: 'Show N/A',
    //     key: 'filters',
    //     trueValue: [{type: 'internal', operation: 'filter', values: ['null']}]
    // })
    SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')
    if(!isDms && !source.source_id) return ;
    console.log('value', value)
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Table', href: `${pageBaseUrl}/${pgEnv}/${params.id}/table`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={source.views}
                       pgEnv={pgEnv}
                       sourceType={isDms ? 'internal' : source.type}
                       showVersionSelector={true}
        >
            {
                (isDms && !source.config) || !value?.sourceInfo?.columns?.length ? <div className={'p-1 text-center'}>Please setup metadata.</div> :
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
                            app: source.app,
                            isActive: true
                        }}>

                            <Controls context={ComponentContext} cms_context={DatasetsContext}/>
                            <RenderFilters state={value} setState={setValue} apiLoad={apiLoad} isEdit={true} defaultOpen={true} cms_context={DatasetsContext}/>

                            <DataWrapper.EditComp
                                cms_context={DatasetsContext}
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