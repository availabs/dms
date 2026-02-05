import { useContext, useEffect, useMemo, useState, useCallback } from "react";
import { get, isEqual } from "lodash-es";
import { CMSContext, PageContext } from "../../context";

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
                const doc_type = valueGetter(i, "doc_type");
                const app = valueGetter(i, "app");
                const env = doc_type ? `${app}+${doc_type}` : e;

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

export function useDataSource({ state, setState, sourceTypes = ["external", "internal"] }) {
  const { app, type, falcor, datasources } = useContext(CMSContext) || {};
  const { format } = useContext(PageContext) || {};

    const [sources, setSources] = useState([]);
    const [views, setViews] = useState([]);
    const sourceId = (state.sourceInfo?.source_id);
    const viewId = (state.sourceInfo?.view_id);

    const sectionColumns = useMemo(
        () =>
            (
                (format?.registerFormats || []).find((f) =>
                    f.type.includes("cms-section")
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

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            getSources({ envs, falcor }).then((data) => {
                setSources(data);

                const existing = data.find((d) => +d.source_id === +sourceId);

                if (existing && !isEqual(existing.columns, state.sourceInfo?.columns)) {
                    // Include baseUrl from envs when updating sourceInfo
                    const baseUrl = envs[existing.srcEnv]?.baseUrl || '';
                    setState((draft) => {
                        draft.sourceInfo = { ...draft.sourceInfo, ...existing, baseUrl };
                    });
                }
            })
        }, 300);

        return () => clearTimeout(timeoutId);
    }, []);

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

    // =================================================================================================================
    // ================================================ handlers =======================================================
    // =================================================================================================================

    const onSourceChange = useCallback(
        (sourceId) => {
            const match = sources.find((s) => +s.source_id === +sourceId);

            setState((draft) => {
                if (!match && typeof sourceId === "string" && sourceId.includes("+")) {
                    draft.columns = [];
                    const sourceType = sourceId.includes("+sections")
                        ? "sections"
                        : "pages";

                    // Get baseUrl for internal sources
                    const internalBaseUrl = datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms';

                    draft.sourceInfo = {
                        isDms: true,
                        app,
                        type:
                            sourceType === "pages"
                                ? type
                                : `${type.replace("+sections", "")}|cms-section`,
                        name: sourceType,
                        columns:
                            sourceType === "pages" ? pageColumns : sectionColumns,
                        env:
                            sourceType === "pages"
                                ? sourceId
                                : `${app}+${type.replace(
                                    "+sections",
                                    ""
                                )}|cms-section`,
                        view_id: "",
                        source_id: sourceId,
                        baseUrl: internalBaseUrl,
                    };
                } else if (match) {
                    const { doc_type, ...rest } = match;
                    // Get baseUrl from the matched source's environment
                    const newColumns = rest.columns;
                    const newColumnsNames = newColumns.map(c => c.name);
                    draft.columns = draft.columns.filter(c => newColumnsNames.includes(c.name)).map(c => ({...c, ...newColumns.find(newC => newC.name === c.name)}));
                    const baseUrl = envs[match.srcEnv]?.baseUrl || '';
                    draft.sourceInfo = { ...rest, type: doc_type, baseUrl };
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
                draft.sourceInfo = {
                    ...draft.sourceInfo,
                    view_id,
                    view_name: version || name,
                    updated_at: _modified_timestamp || updated_at,
                };
            });
        },
        [views, setState]
    );

    return {
        activeSource: sourceId,
        activeView: viewId,
        sources: [
            {key: `${app}+${type}`, label: `${type} (pages)`},
            {key: `${app}+${type}+sections`, label: `${type} (sections)`},
            ...sources.map(({source_id, name, srcEnv}) => ({key: source_id, label: `${name} (${envs[srcEnv]?.label || ''})`}))
        ],
        views: views.map(({view_id, name, version}) => ({key: view_id, label: name || version || view_id})),
        onSourceChange,
        onViewChange,
    };
}
