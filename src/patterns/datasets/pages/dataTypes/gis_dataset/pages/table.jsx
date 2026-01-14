import React, {useCallback, useContext, useEffect, useMemo} from "react";
import { DatasetsContext } from '../../../../context'
import Spreadsheet from "../../../../../page/components/sections/components/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router";
import DataWrapper from "../../../../../page/components/sections/components/dataWrapper";
import {cloneDeep, isEqual, uniqBy} from "lodash-es";
import {ComponentContext} from "../../../../../page/context";
import {useImmer} from "use-immer";
import {
    RenderFilters
} from "../../../../../page/components/sections/components/dataWrapper/components/filters/RenderFilters";
import { Controls } from "../../../../../page/components/sections/components/dataWrapper/components/Controls";
import {ThemeContext} from "../../../../../../ui/useTheme";
import {isJson} from "../../default/utils";

export default function Table ({apiUpdate, apiLoad, format, source, params, isDms}) {
    const {id, view_id} = params;
    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed, pgEnv} = useContext(DatasetsContext) || {};

    let columns = useMemo(() =>
        isDms ?
            isJson(source.config) ? JSON.parse(source.config)?.attributes : [] :
            (source?.metadata?.columns || []), [source.config, isDms, source?.metadata?.columns])

    const default_columns = (source?.default_columns || source?.defaultColumns) || [];


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
            columns.map(c => ({...c, show:true})),
    })

    useEffect(() => {
        const sourceInfo = isDms ? {
            app: source.app,
            type: `${source.doc_type}-${params.view_id}`,
            env: `${source.app}+${source.doc_type}`,
            doc_type: `${source.doc_type}-${params.view_id}`,
            isDms,
            originalDocType: source.doc_type,
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

        const activeColumns = isDms ? undefined : source?.metadata?.columns?.map(c => ({...c, show:true}));
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

        apiUpdate({data: {...source, default_columns: columns}, config: {format}});
    }, [value]);

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/table/${recentView}`)
        }
    }, [source.views]);

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    SpreadSheetCompWithControls.controls = {};
    // SpreadSheetCompWithControls.controls.columns.push({
    //     type: 'toggle',
    //     label: 'Show N/A',
    //     key: 'filters',
    //     trueValue: [{type: 'internal', operation: 'filter', values: ['null']}]
    // })
    // SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')
    if(!isDms && !source.source_id) return ;
    console.log('value', value)
    return (
        (isDms && !source.config) || !value?.sourceInfo?.columns?.length ? <div className={'p-1 text-center'}>Please setup metadata.</div> :
            !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                <div className={`${theme?.page?.wrapper1}`}>
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
    )
}