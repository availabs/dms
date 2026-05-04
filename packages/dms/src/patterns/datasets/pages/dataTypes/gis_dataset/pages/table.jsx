import React, {useCallback, useContext, useEffect, useMemo} from "react";
import { DatasetsContext } from '../../../../context'
import { getExternalEnv } from '../../../../utils/datasources'
import Spreadsheet from "../../../../../page/components/sections/components/ComponentRegistry/spreadsheet/config";
import {useNavigate} from "react-router";
import DataWrapper from "../../../../../page/components/sections/components/dataWrapper";
import {cloneDeep, isEqual, uniqBy} from "lodash-es";
import {useImmer} from "use-immer";
import {ThemeContext} from "../../../../../../ui/useTheme";
import { nameToSlug } from "../../../../../../utils/type-utils";

export default function Table ({apiUpdate, apiLoad, format, source, params, isDms}) {
    const {id, view_id} = params;
    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed, datasources} = useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);

    let columns = useMemo(() => {
        if (!isDms) return source?.metadata?.columns || [];
        // source.config may arrive as a JSON string (UDA `data->>'config'`)
        // or as an already-parsed object. Handle both. Empty-string,
        // missing, and unparseable values all fall through to [].
        const cfg = source?.config;
        if (!cfg) return [];
        let parsed = null;
        if (typeof cfg === 'string') {
            try { parsed = JSON.parse(cfg); } catch { parsed = null; }
        } else if (typeof cfg === 'object') {
            parsed = cfg;
        }
        return Array.isArray(parsed?.attributes) ? parsed.attributes : [];
    }, [source?.config, isDms, source?.metadata?.columns]);

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
            // Enable the spreadsheet's auto-resize pass so columns get
            // sensible initial widths (Math.max(minInitColSize, gridWidth/n))
            // instead of rendering at the browser's narrow default.
            autoResize: true,
        },
        columns: default_columns?.length ?
            uniqBy(default_columns.map(dc => columns.find(col => col.name === dc.name)).filter(c => c).map(c => ({...c, show: true})), d => d?.name) :
            columns.map(c => ({...c, show:true})),
    })

    useEffect(() => {
        const sourceSlug = nameToSlug(source.name);
        const sourceInfo = isDms ? {
            app: source.app,
            type: `${sourceSlug}|${params.view_id}:data`,
            env: `${source.app}+${sourceSlug}`,
            doc_type: `${sourceSlug}|${params.view_id}:data`,
            isDms,
            originalDocType: sourceSlug,
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

        // Source-derived columns. For DMS we read from source.config (which
        // arrives async via getSourceData); for DAMA from source.metadata.columns.
        const activeColumns = isDms
            ? columns?.map(c => ({...c, show: true}))
            : source?.metadata?.columns?.map(c => ({...c, show: true}));

        setValue(draft => {
            if(!isEqual(draft.sourceInfo, sourceInfo)){
                draft.sourceInfo = sourceInfo;
            }

            // Initial-mount race: useImmer's initializer ran before
            // getSourceData() resolved source.config / source.metadata.columns,
            // so draft.columns is []. When the source finally has columns,
            // sync them. For DMS we only sync from empty so user toggles
            // aren't overwritten on subsequent re-renders. For DAMA we keep
            // the legacy "always sync on change" behavior.
            if (isDms) {
                if (!draft.columns?.length && activeColumns?.length) {
                    draft.columns = activeColumns;
                }
            } else if (!isEqual(draft.columns, activeColumns)) {
                draft.columns = activeColumns;
            }
        })
    }, [source, id, view_id, isDms, pgEnv, columns])

    // Build a serialized state snapshot for DataWrapper.EditComp. It owns its
    // own useImmer state initialized from the `value` prop via migrateToV2;
    // passing `value=''` (or no value) means DataWrapper starts with empty
    // defaults and the spreadsheet renders "No columns selected" regardless
    // of what this outer component thinks. We compose the snapshot here once
    // source.config has resolved, then hand it to DataWrapper as its initial
    // state. The snapshot key includes source+view so DataWrapper remounts
    // cleanly when the user navigates between versions/sources.
    const dwInitialValue = useMemo(() => {
        if (!value?.columns?.length) return null;
        const snapshot = {
            externalSource: value.sourceInfo,
            columns: value.columns,
            filters: { op: 'AND', groups: [] },
            display: value.display || {},
            data: [],
        };
        return JSON.stringify(snapshot);
    }, [value?.columns, value?.sourceInfo, value?.display]);

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

    // Stable per-source/view key so DataWrapper remounts only when navigating
    // to a different source or version, not on every state change.
    const dwKey = `table-page-${source?.source_id || source?.id || 'x'}-${params.view_id || 'x'}`;

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
                    {dwInitialValue ? (
                        <DataWrapper.EditComp
                            cms_context={DatasetsContext}
                            component={SpreadSheetCompWithControls}
                            value={dwInitialValue}
                            onChange={() => {}}
                            key={dwKey}
                            size={1}
                            hideSourceSelector={true}
                            theme={theme}
                        />
                    ) : (
                        <div className="p-4 text-gray-400">Loading columns...</div>
                    )}
                </div>
    )
}