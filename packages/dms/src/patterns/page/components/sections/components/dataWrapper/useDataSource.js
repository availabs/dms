import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { get, isEqual, join } from "lodash-es";
import { nameToSlug } from "../../../../../../utils/type-utils";
import { CMSContext, PageContext } from "../../../../context";

const range = (start, end) => Array.from({ length: end + 1 - start }, (_, k) => k + start);

const getSources = async ({ envs, falcor }) => {
    if (!envs || !Object.keys(envs).length) return [];

    const lenRes = await falcor.get(["uda", Object.keys(envs), "sources", "length"]);

    const sources = await Promise.all(
        Object.keys(envs).map(async (e) => {
            const len = get(lenRes, ["json", "uda", e, "sources", "length"]);
            if (!len) return [];

            const r = await falcor.get(["uda", e, "sources", "byIndex", { from: 0, to: len - 1 }, envs[e].srcAttributes]);

            const valueGetter = (i, attr) =>
                get(r, ["json", "uda", e, "sources", "byIndex", i, attr]);

            return range(0, len - 1).map((i) => {
                const app = valueGetter(i, "app");
                const name = valueGetter(i, "name");
                // For DMS sources, build env from source name slug (matches how data types are stored)
                const sourceSlug = name ? nameToSlug(name) : null;
                const env = sourceSlug && app ? `${app}+${sourceSlug}` : e;

                return {
                    ...envs[e].srcAttributes.reduce((acc, attr) => {
                        let value = valueGetter(i, attr);

                        if (attr === "metadata") {
                            return { ...acc, columns: value?.columns || [] };
                        }
                        if (attr === "config") {
                            return {
                                ...acc,
                                columns: JSON.parse(value || "{}")?.attributes || [],
                            };
                        }
                        return { ...acc, [attr]: value };
                    }, {}),
                    source_id: get(
                        r,
                        ["json", "uda", e, "sources", "byIndex", i, "$__path", 4]
                    ),
                    env,
                    srcEnv: e,
                    isDms: envs[e].isDms,
                };
            });
        })
    );

    return sources.flat();
};

const getViews = async ({ envs, sourceId, srcEnv, falcor }) => {
    if (!srcEnv || !sourceId) return [];

    const lenRes = await falcor.get(["uda", srcEnv, "sources", "byId", sourceId, "views", "length",]);

    const len = get(lenRes, ["json", "uda", srcEnv, "sources", "byId", sourceId, "views", "length"]);
    if (!len) return [];

    const byIndexRes = await falcor.get(["uda", srcEnv, "sources", "byId", sourceId, "views", "byIndex", { from: 0, to: len - 1 }, envs[srcEnv].viewAttributes]);

    return range(0, len - 1).map((i) => ({
        view_id: get(byIndexRes, ["json", "uda", srcEnv, "sources", "byId", sourceId, "views", "byIndex", i, "$__path", 4]),
        ...envs[srcEnv].viewAttributes.reduce(
            (acc, attr) => ({
                ...acc,
                [attr]: get(byIndexRes, ["json", "uda", srcEnv, "sources", "byId", sourceId, "views", "byIndex", i, attr]),
            }),
            {}
        ),
    }));
};

const DEFAULT_SOURCE_TYPES = ["external", "internal"];

export function useDataSource({ state, setState, sourceTypes = DEFAULT_SOURCE_TYPES }) {
  const { app, type, falcor, datasources } = useContext(CMSContext) || {};
  const { format } = useContext(PageContext) || {};

    const [sources, setSources] = useState([]);
    const [views, setViews] = useState([]);
    const [joinViews, setJoinViews] = useState([])

    const sourceId = (state?.externalSource?.source_id);
    const viewId = (state?.externalSource?.view_id);

    const joinSourceId = (state?.join?.sources?.table2?.source);
    const joinViewId = (state?.join?.sources?.table2?.view);

    const sectionColumns = useMemo(
        () =>
            (
                (format?.registerFormats || []).find((f) =>
                    f.type.includes("component") || f.type.includes("cms-section")
                )?.attributes || []
            ).map((a) => ({ ...a, name: a.name || a.key })),
        [format]
    );

    const pageColumns = useMemo(
        () => (format?.attributes || []).map((a) => ({ ...a, name: a.name || a.key })),
        [format]
    );

    const envs = useMemo(
        () => {
            if (!datasources?.length) return {};

            return datasources
                .filter(ds => sourceTypes.includes(ds.type))
                .reduce((acc, ds) => {
                    acc[ds.env] = {
                        label: ds.label,
                        isDms: ds.isDms || false,
                        baseUrl: ds.baseUrl,
                        srcAttributes: ds.srcAttributes,
                        viewAttributes: ds.viewAttributes,
                    };
                    return acc;
                }, {});
        },
        [datasources, sourceTypes]
    );

    // =================================================================================================================
    // ================================================ load sources ===================================================
    // =================================================================================================================

    const envsKeyCount = Object.keys(envs).length;
    useEffect(() => {
        if (!envsKeyCount) return;
        const timeoutId = setTimeout(() => {
            getSources({ envs, falcor }).then((data) => {
                setSources(data);

                const existing = data.find((d) => +d.source_id === +sourceId);

                if (existing && !isEqual(existing.columns, state?.externalSource?.columns)) {
                    // Include baseUrl from envs when updating externalSource
                    const baseUrl = envs[existing.srcEnv]?.baseUrl || '';
                    setState((draft) => {
                        if (!draft) return;
                        console.log("is this where we are setting initial state???")

                        if(draft.join && draft.join.sources.table2.joinColumn && draft.join.sources.ds.joinColumn){
                            const joinColumns = Object.values(draft.join.sources).filter(jSource => !!jSource.sourceInfo).map(jSource => jSource.sourceInfo.columns).flat().map(jSourceCol => ({...jSourceCol, source_id:draft.join.sources.table2.source}));
                            const sourceCols = draft.externalSource?.columns.filter(sCol => sCol.source_id === draft.externalSource.source_id)
                            const allCols = [...sourceCols, ...joinColumns];
                            console.log("allCols::",JSON.parse(JSON.stringify(allCols)))
                            draft.externalSource = { ...draft.externalSource, ...existing, baseUrl, columns:allCols };
                        } else {
                            draft.externalSource = { ...draft.externalSource, ...existing, baseUrl };
                        }

                        
                    });
                }
            })
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [envsKeyCount]);

    // =================================================================================================================
    // ================================================ load views =====================================================
    // =================================================================================================================

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // some old component have deprecated srcEnv (app+siteType), so always send updated value.
            const srcEnv = sources.find((d) => +d.source_id === +sourceId)?.srcEnv;
            getViews({envs, sourceId, srcEnv, falcor})
                .then((data) => {
                    setViews(data);
                })
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [sourceId, sources]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // some old component have deprecated srcEnv (app+siteType), so always send updated value.
            const srcEnv = sources.find((d) => +d.source_id === +joinSourceId)?.srcEnv;
            getViews({envs, sourceId: joinSourceId, srcEnv, falcor})
                .then((data) => {
                    setJoinViews(data);
                })
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [joinSourceId, sources]);


    // =================================================================================================================
    // ================================================ handlers =======================================================
    // =================================================================================================================

    const onSourceChange = useCallback(
        (sourceId) => {
            const match = sources.find((s) => +s.source_id === +sourceId);
            console.log("on source change, does this fire on each pag load???")
            setState((draft) => {
                if (!match && typeof sourceId === "string" && sourceId.includes("+")) {
                    draft.columns = [];
                    const sourceType = sourceId.endsWith("|component")
                        ? "sections"
                        : "pages";

                    // Get baseUrl for internal sources
                    const internalBaseUrl = datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms';

                    draft.externalSource = {
                        isDms: true,
                        app,
                        type: sourceType === "pages"
                            ? `${type}|page`
                            : `${type}|component`,
                        name: sourceType,
                        columns:
                            sourceType === "pages" ? pageColumns : sectionColumns,
                        env: sourceId,
                        view_id: "",
                        source_id: sourceId,
                        baseUrl: internalBaseUrl,
                    };
                } else if (match) {
                    // Get baseUrl from the matched source's environment
                    const newColumns = match.columns;
                    const newColumnsNames = newColumns.map(c => c.name);
                    draft.columns = draft.columns.filter(c => newColumnsNames.includes(c.name)).map(c => ({...c, ...newColumns.find(newC => newC.name === c.name)}));
                    const baseUrl = envs[match.srcEnv]?.baseUrl || '';
                    const sourceType = match.name ? nameToSlug(match.name) : draft.externalSource?.type;
                    draft.externalSource = { ...match, baseUrl, type: sourceType };
                }
            });
        },
        [sources, app, type, pageColumns, sectionColumns, setState, datasources, envs]
    );

    const onViewChange = useCallback(
        (viewId) => {
            const view = views.find((v) => +v.view_id === +viewId);
            if (!view) return;

            const { view_id, name, version, updated_at, _modified_timestamp } = view;

            setState((draft) => {
                draft.externalSource = {
                    ...draft.externalSource,
                    view_id,
                    view_name: version || name,
                    updated_at: _modified_timestamp || updated_at,
                };
            });
        },
        [views, setState]
    );

    const onJoinChange = useCallback(
        (joinObj) => {
            console.log("join change callback, updated fields::", joinObj);
            const updatedField = Object.keys(joinObj)[0];
            if(updatedField === 'source') {
                setState((draft) => {
                    // draft.join.sources.ds.sourceInfo = draft.externalSource;
                    // draft.join.sources.ds.source = draft.externalSource.source_id;
                    // draft.join.sources.ds.view = draft.externalSource.view_id;//not always set by the externalSource 
                    // draft.join.sources.ds.columns = draft.columns;

                    //First try just adding a table alias key to existing columns
                    //then, can try to modify column names if we want

                    //filter out any columns from previous table2 source
                    draft.externalSource.columns = draft.externalSource.columns
                      .filter((col) => !col.source_id || col.source === draft.externalSource.source_id)
                      .map((col) => ({ ...col, source_id: draft.externalSource.source_id }));
                    console.log({sources})
                    console.log({joinSourceId})
                    const joinSource = sources.find((d) => +d.source_id === joinObj[updatedField])
                    console.log("join source::", joinSource)
                    draft.externalSource.columns = [
                      ...draft.externalSource.columns,
                      ...joinSource.columns.map((col) => ({ ...col, source_id: joinSourceId })),
                    ];

                    //set join_source_id on externalSource
                    draft.externalSource.join_source_id = joinSourceId;
                })
            }


            if(joinObj.source && state?.join?.sources?.table2.source !== joinObj.source){
                console.log("join source changed. Calling helper function")
                onJoinSourceChange(joinObj.source)
            } else {
                setState((draft) => {
                    draft.join = {
                        sources: {
                            ...draft?.join.sources,
                            table2:{
                                ...draft?.join?.sources?.table2,
                                ...joinObj
                            }
                        }
                    };
                });
            }
        },
        [sources, app, type, pageColumns, sectionColumns, setState, datasources, envs, state.join, joinSourceId]
    );

    const onJoinSourceChange =  useCallback(
        (sourceId) => {
            const match = sources.find((s) => +s.source_id === +sourceId);

            setState((draft) => {
                if (!match && typeof sourceId === "string" && sourceId.includes("+")) {
                    console.log("join source internal")
                    const sourceType = sourceId.endsWith("|component")
                        ? "sections"
                        : "pages";

                    // Get baseUrl for internal sources
                    const internalBaseUrl = datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms';

                    draft.join.sources.table2.sourceInfo = {
                        isDms: true,
                        app,
                        type: sourceType === "pages"
                            ? `${type}|page`
                            : `${type}|component`,
                        name: sourceType,
                        columns:
                            sourceType === "pages" ? pageColumns : sectionColumns,
                        env: sourceId,
                        view_id: "",
                        source_id: sourceId,
                        baseUrl: internalBaseUrl,
                    };
                    draft.join.sources.table2.columns = [];
                    draft.join.sources.table2.source = sourceId;
                    draft.join.sources.table2.view = null;

                } else if (match) {
                    console.log("join source external")
                    // Get baseUrl from the matched source's environment
                    const newColumns = match.columns;
                    const newColumnsNames = newColumns.map(c => c.name);
                    const baseUrl = envs[match.srcEnv]?.baseUrl || '';
                    const sourceType = match.name ? nameToSlug(match.name) : draft.join.sources.table2.sourceInfo?.type;
                    draft.join.sources.table2.sourceInfo = { ...match, baseUrl, type: sourceType };
                    draft.join.sources.table2.columns = draft?.join?.sources?.table2?.columns?.filter(c => newColumnsNames.includes(c.name)).map(c => ({...c, ...newColumns.find(newC => newC.name === c.name)}));
                    draft.join.sources.table2.source = sourceId;
                    draft.join.sources.table2.view = null;
                }
            });
        },
        [sources, app, type, pageColumns, sectionColumns, setState, datasources, envs]
    );


    const sourceOptions = useMemo(() => [
        {key: `${app}+${type}|page`, label: `${type} (pages)`},
        {key: `${app}+${type}|component`, label: `${type} (sections)`},
        ...sources.map(({source_id, name, srcEnv}) => {
            const envLabel = srcEnv?.includes('+')
                ? srcEnv.split('+')[1]
                : envs[srcEnv]?.label;
            return {key: source_id, label: `${name}${envLabel ? ` [${envLabel}]` : ''}`};
        })
    ], [sources, app, type, envs]);

    const viewOptions = useMemo(
        () => views.map(({view_id, name, version}) => ({key: view_id, label: name || version || view_id})),
        [views]
    );

    const joinViewOptions = useMemo(
        () => joinViews.map(({view_id, name, version}) => ({key: view_id, label: name || version || view_id})),
        [joinViews]
    );

    return useMemo(() => ({
        activeSource: sourceId,
        activeView: viewId,
        activeJoinSource: joinSourceId,
        activeJoinView: joinViewId,
        sources: sourceOptions,
        views: viewOptions,
        activeJoinViews: joinViewOptions,
        onSourceChange,
        onViewChange,
        onJoinChange,
    }), [sourceId, viewId, sourceOptions, viewOptions, joinSourceId, joinViewId, joinViewOptions, onSourceChange, onViewChange, onJoinChange]);
}
