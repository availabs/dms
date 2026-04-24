import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { get, isEqual, set } from "lodash-es";
import { nameToSlug } from "../../../../../../utils/type-utils";
import { CMSContext, PageContext } from "../../../../context";
import { EXTERNAL_SOURCE_KEY } from "./schema";
import { DEFAULT_SOURCE_JOIN } from "./utils/utils";
import { SchemaManager } from "./SchemaManager";
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

    const { join } = state;
    const isJoinPresent =
        !!join &&
        (Object.keys(join.sources || {}).length > 1 ||
            (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== "ds"));
    const [sources, setSources] = useState([]);
    const [views, setViews] = useState([]);
    const [joinViewsByAlias, setJoinViewsByAlias] = useState({});
    const sourceId = (state?.[EXTERNAL_SOURCE_KEY]?.source_id);
    const viewId = (state?.[EXTERNAL_SOURCE_KEY]?.view_id);
    const joinSources = (join?.sources || {});

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

                if (existing && (!isEqual(existing.columns, state?.[EXTERNAL_SOURCE_KEY]?.columns) || isJoinPresent) ) {
                    // Include baseUrl from envs when updating externalSource
                    const baseUrl = envs[existing.srcEnv]?.baseUrl || '';
                    setState((draft) => {
                        if (!draft) return;
                        //If we have a join, we want to append all the columns from the joined source into
                        //externalSource.columns. So they show up in the "ColumnManager"
                        //We make sure there are no duplicates, and we add `source_id` to all of them

                        if(isJoinPresent){
                            //Gather all the columns from all our joined sources
                            const joinColumns = Object.values(draft.join.sources)
                              .filter((jSource) => !!jSource.sourceInfo)
                              .map((jSource) =>
                                jSource?.sourceInfo?.columns?.map((jSourceCol) => ({
                                  ...jSourceCol,
                                  source_id: jSource.source,
                                })),
                              )
                              .flat();

                            //Filter out columns that have a source_id that differs from the main source_id
                            //Those get added back in via `joinColumns`
                            const sourceCols = draft?.[EXTERNAL_SOURCE_KEY]?.columns
                              .filter((sCol) => !sCol.source_id || sCol.source_id === draft[EXTERNAL_SOURCE_KEY].source_id)
                              .map((sCol) => ({
                                ...sCol,
                                source_id: state?.[EXTERNAL_SOURCE_KEY].source_id,
                              }));
                            const allCols = [...sourceCols, ...joinColumns];
                            draft[EXTERNAL_SOURCE_KEY] = { ...draft[EXTERNAL_SOURCE_KEY], ...existing, baseUrl, columns: allCols };
                        } else {
                            //Default behavior with no Joins/Unions
                            draft[EXTERNAL_SOURCE_KEY] = { ...draft[EXTERNAL_SOURCE_KEY], ...existing, baseUrl };
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
            Object.keys(joinSources).forEach(alias => {
                if (alias === 'ds') return;
                const joinSourceId = joinSources[alias].source;
                const srcEnv = sources.find((d) => +d.source_id === +joinSourceId)?.srcEnv;
                if (!srcEnv) return;
                
                getViews({envs, sourceId: joinSourceId, srcEnv, falcor})
                    .then((data) => {
                        setJoinViewsByAlias(prev => ({ ...prev, [alias]: data }));
                    });
            });
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [joinSources, sources]);


    // =================================================================================================================
    // ================================================ handlers =======================================================
    // =================================================================================================================

    const onSourceChange = useCallback(
        (sourceId) => {
            const match = sources.find((s) => +s.source_id === +sourceId);
            setState((draft) => {
                if (!match && typeof sourceId === "string" && sourceId.includes("+")) {
                    draft.columns = [];
                    const sourceType = sourceId.endsWith("|component")
                        ? "sections"
                        : "pages";

                    // Get baseUrl for internal sources
                    const internalBaseUrl = datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms';

                    draft[EXTERNAL_SOURCE_KEY] = {
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
                    const sourceType = match.name ? nameToSlug(match.name) : draft[EXTERNAL_SOURCE_KEY]?.type;
                    draft[EXTERNAL_SOURCE_KEY] = { ...match, baseUrl, type: sourceType };
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
                draft[EXTERNAL_SOURCE_KEY] = {
                    ...draft[EXTERNAL_SOURCE_KEY],
                    view_id,
                    view_name: version || name,
                    updated_at: _modified_timestamp || updated_at,
                };
            });
        },
        [views, setState]
    );
    const addJoinSource = useCallback(() => {
        setState(draft => {
            if (!draft.join) draft.join = { sources: {} };
            
            const existingAliases = isJoinPresent ? Object.keys(draft.join.sources) : [];
            let nextNum = 1;
            while (existingAliases.includes(`table${nextNum}`)) {
                nextNum++;
            }
            const nextAlias = `table${nextNum}`;
            //TODO -- should export this as "blankJoinSourceConfig" or something
            draft.join.sources[nextAlias] = {...DEFAULT_SOURCE_JOIN};
        });
    }, [state, setState]);

    const onJoinSourceChange = useCallback(
        (alias, newJoinSourceId) => {
            const newJoinMatch = sources.find((s) => +s.source_id === +newJoinSourceId);
            const previousJoinSourceId = join?.sources[alias]?.source;
            if (newJoinMatch) {
                setState((draft) => {
                    const baseUrl = envs[newJoinMatch.srcEnv]?.baseUrl || "";
                    const sourceType = newJoinMatch.name ? nameToSlug(newJoinMatch.name) : draft.join.sources[alias].sourceInfo?.type;

                    draft.join.sources[alias].sourceInfo = { ...newJoinMatch, baseUrl, type: sourceType };
                    draft.join.sources[alias].source = newJoinSourceId;
                    draft.join.sources[alias].view = null;

                    draft[EXTERNAL_SOURCE_KEY].columns = SchemaManager.updateColumnsForJoinSource(
                        draft[EXTERNAL_SOURCE_KEY].columns,
                        newJoinMatch,
                        newJoinSourceId,
                        previousJoinSourceId
                    );
                });
            }
        },
        [sources, setState, envs]
    );

    const onJoinViewChange = useCallback(
        (alias, viewId) => {
            const selectedView = joinViewsByAlias[alias].find(jView => jView.view_id === viewId);
            setState((draft) => {
                draft.join.sources[alias].view = viewId;
                draft.join.sources[alias].sourceInfo.updated_at = selectedView?._modified_timestamp
            });
        },
        [joinViewsByAlias, setState]
    );

    const onMergeStrategyChange = useCallback(
      (alias, mergeStrategy) => {
        setState((draft) => {
          set(draft.join.sources[alias], "mergeStrategy", mergeStrategy);
          if (mergeStrategy !== "join") {
            draft.join.sources[alias].joinColumns = [];
            draft.join.sources[alias].type = null;
          }
        });
      },
      [state, setState],
    );

    const onJoinColumnsChange = useCallback((alias, joinVal) => {
        setState(draft => {
            if (!draft.join) draft.join = { sources: {} };
            // Ensure the source entry and joinColumns array exist
            if (!draft.join.sources[alias]) {
                draft.join.sources[alias] = {
                    source: null,
                    view: null,
                    sourceInfo: {},
                    joinColumns: []
                };
            } else if (!draft.join.sources[alias].joinColumns) {
                draft.join.sources[alias].joinColumns = [];
            }
            // Assuming only one join column definition per alias for now
            draft.join.sources[alias].joinColumns = joinVal;
        });
    }, [state, setState])

    const onJoinChange = useCallback(
        (alias, path, joinVal) => {
            console.log("join change callback, alias::", alias, "path::", path, "val::", joinVal);
            if(path === "source"){
                onJoinSourceChange(alias, joinVal)
            } else if (path === "view"){
                onJoinViewChange(alias, joinVal)
            } else if (path === "type") {
                setState(draft => {
                    set(draft.join.sources[alias], path, joinVal)
                })
            } else if (path === "mergeStrategy") {
                onMergeStrategyChange(alias, joinVal);
            } else if (path === "joinColumns") {
                onJoinColumnsChange(alias, joinVal)
            }
        },
        [onJoinSourceChange, onJoinViewChange, onMergeStrategyChange, onJoinColumnsChange, setState]
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

    const joinViewOptionsByAlias = useMemo(() => {
        const result = {};
        Object.keys(joinViewsByAlias).forEach(alias => {
            result[alias] = joinViewsByAlias[alias].map(({view_id, name, version}) => ({key: view_id, label: name || version || view_id}));
        });
        return result;
    }, [joinViewsByAlias]);
    const removeJoinSource = useCallback(
        (alias) => {
            setState((draft) => {
                if (!draft.join || !draft.join.sources[alias]) return;

                const sourceIdToRemove = draft.join.sources[alias].source;
                delete draft.join.sources[alias];

                // Cleanup associated columns
                if (draft[EXTERNAL_SOURCE_KEY] && draft[EXTERNAL_SOURCE_KEY].columns) {
                    draft[EXTERNAL_SOURCE_KEY].columns = draft[EXTERNAL_SOURCE_KEY].columns.filter(
                        (col) => !col.source_id || col.source_id !== sourceIdToRemove
                    );
                }
            });
        },
        [setState]
    );
 
    return useMemo(() => ({
        activeSource: sourceId,
        activeView: viewId,
        sources: sourceOptions,
        views: viewOptions,
        isJoinPresent,
        activeJoinViewsByAlias: joinViewOptionsByAlias,
        onSourceChange,
        onViewChange,
        onJoinChange,
        addJoinSource,
        removeJoinSource
    }), [sourceId, viewId, sourceOptions, viewOptions, joinViewOptionsByAlias, onSourceChange, onViewChange, onJoinChange, addJoinSource, removeJoinSource]);
}
