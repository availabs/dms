import React, {useEffect, useMemo, createContext, useRef} from "react";
import { get, cloneDeep, isEqual } from "lodash-es"
import mapboxgl from "maplibre-gl";
import { AvlMap } from "../../../../../../../ui/components/map"
// import { PMTilesProtocol } from './pmtiles/index'
import { useImmer } from 'use-immer';
import LegendPanel from './LegendPanel/LegendPanel.jsx'
import LayerLibraryPanel from './LayerLibraryPanel/LayerLibraryPanel.jsx'
import SymbologyViewLayer from './SymbologyViewLayer.jsx'
import { PageContext, CMSContext } from "../../../../../context.js";
// import {SymbologySelector} from "./SymbologySelector.jsx";
// import FilterControls from "./controls/FilterControls.jsx";
import {defaultStyles, blankStyles} from "./styles.js";
// import MoreControls from "./controls/MoreControls.jsx";
import PluginLayer from "../../../../../../mapeditor/MapEditor/components/PluginLayer"
import { PluginLibrary, PLUGIN_TYPE } from "../../../../../../mapeditor/MapEditor";
import ExternalPluginPanel from "../../../../../../mapeditor/MapEditor/components/ExternalPluginPanel";
import { buildLayerUdaFilterOptions, fetchBoundsForFilter } from '../../../../../../mapeditor/MapEditor/stateUtils';
import { choroplethPaint } from "./utils.js";
import { ThemeContext, getComponentTheme } from "../../../../../../../ui/useTheme";
import { damaMapTheme } from "./map.theme";

import mapeditorFormat from "../../../../../../mapeditor/mapeditor.format"

// const MAP_EDITOR_FORMAT = cloneDeep(mapeditorFormat);

export const HEIGHT_OPTIONS = {
    "full": 'calc(95vh)',
    // True viewport height for full-screen workbench pages (pair with the
    // `workbench` sectionGroup style + a p-0 section).
    "screen": '100vh',
    1: "900px",
    "2/3": "600px",
    "1/3": "300px",
    "1/4": "150px",
};

export const PANEL_POSITION_OPTIONS = {
    'top-left':"top-0 left-0",
    'top':"left-[40%] top-0",
    'top-right':"top-0 right-0",
    'bottom-left':"bottom-0 left-0",
    'bottom':"left-[40%] bottom-0",
    'bottom-right':"bottom-0 right-0",
    'hide':'hidden'
}

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const MapContext = createContext(undefined);

const EMPTY_TABS = [{ "name": "Layers", rows: [] }];
const EMPTY_OBJECT = {};

/**
 * Returns the join-authored output columns that should be emitted onto vector
 * tile features for this layer. These tile columns are the runtime surface
 * area that the DMS map can style, hover, and filter against later.
 */
const getJoinTileColumns = (layerConfig) =>
    Array.isArray((layerConfig?.join || layerConfig?.["linked-data"])?.tileColumns)
        ? (layerConfig.join || layerConfig["linked-data"]).tileColumns.filter(Boolean)
        : [];

/**
 * Pulls the ordered color ramp out of a saved choropleth `fill-color` paint
 * expression. The map's paint is the real source of truth for a layer's colors,
 * so when a layer has no explicit `color-range` (older saves store the ramp only
 * in the paint), we recover the author's colors from here instead of falling
 * back to an empty ramp — which would render a colorless legend that overwrites
 * the good saved legend-data.
 *
 * Handles both a bare step expression and one wrapped in a `case` null-guard:
 *   ["step", input, color0, break1, color1, break2, ...]  → colors at even idx ≥ 2
 */
const extractStepColors = (fillColor) => {
    if (!Array.isArray(fillColor)) return [];
    let step = fillColor;
    if (fillColor[0] === "case") {
        step = fillColor.find((el) => Array.isArray(el) && el[0] === "step") || [];
    }
    if (step[0] !== "step") return [];
    const colors = [];
    for (let i = 2; i < step.length; i += 2) colors.push(step[i]);
    return colors;
};

/**
 * Resolves the saved paint expression that holds a layer's color ramp, by layer
 * type. The sub-layer index is canonical (getFillLayer/getCircleLayer in the
 * editor): fill = layers[1].fill-color, line = layers[1].line-color, circle =
 * layers[0].circle-color. Mirrors LegendPanel's `typePaint` so the ramp is read
 * from the right slot regardless of geometry type.
 */
const getSavedRampPaint = (layer) => {
    switch (layer?.type) {
        case "circle": return get(layer, `layers[0].paint['circle-color']`);
        case "line":   return get(layer, `layers[1].paint['line-color']`);
        case "fill":
        default:       return get(layer, `layers[1].paint['fill-color']`);
    }
};

/**
 * Normalizes the saved join config so the runtime can read one consistent
 * shape even while older saved symbologies still use legacy nested keys.
 */
const normalizeJoinRuntimeConfig = (layerConfig = {}) => {
    const joinConfig = layerConfig?.join || layerConfig?.["linked-data"] || null;
    if (!joinConfig) return null;
    return {
        ...joinConfig,
        source: joinConfig.source || joinConfig.linked || {},
        joinColumn: joinConfig.joinColumn || joinConfig.linkedJoinColumn || "",
        query: joinConfig.query || joinConfig.linkedQuery || {},
    };
};

/**
 * Converts the editor-side join query filter rows into the UDA filter payload
 * expected by `colorDomain` and other runtime fetches.
 */
const buildJoinFilterOptions = (joinQuery = {}) => {
    const filterRows = Array.isArray(joinQuery?.filterRows) ? joinQuery.filterRows : [];
    const filterMode = joinQuery?.filterMode === "any" ? "OR" : "AND";
    const groups = filterRows.reduce((acc, row) => {
        if (!row?.column) return acc;
        const values = String(row.valuesText || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        if (!values.length) return acc;
        acc.push({
            op: "filter",
            col: row.column,
            value: values,
        });
        return acc;
    }, []);

    if (groups.length) {
        return {
            filterGroups: {
                op: filterMode,
                groups,
            },
        };
    }

    return joinQuery?.filters && Object.keys(joinQuery.filters).length
        ? joinQuery.filters
        : {};
};

/**
 * Finds the SQL select expression that produces a given join output name. This
 * lets the runtime ask for the exact join expression that backs a styled or
 * filtered join column instead of assuming the alias is a physical table field.
 */
const getJoinQueryAttributeByOutputName = (layerConfig, outputName) => {
    const joinConfig = normalizeJoinRuntimeConfig(layerConfig);
    const joinAttributes = Array.isArray(joinConfig?.query?.columns)
        ? joinConfig.query.columns
        : [];

    return joinAttributes.find((attribute) => {
        const aliasMatch = String(attribute).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
        const resolvedName = aliasMatch?.[2] || String(attribute).trim();
        return resolvedName === outputName;
    }) || null;
};

/**
 * Builds the join payload sent to DMS runtime `colorDomain` requests.
 *
 * When a specific joined style column is active, the payload narrows the join
 * attributes down to the join key plus the requested output expression so
 * legend refresh only pulls the join-side fields it actually needs.
 */
const buildJoinOptions = (layerConfig, dataColumn = null) => {
    const joinConfig = normalizeJoinRuntimeConfig(layerConfig);
    if (
        !joinConfig?.enabled ||
        !joinConfig?.source?.viewId ||
        !joinConfig?.featureKeyColumn ||
        !joinConfig?.joinColumn
    ) {
        return null;
    }

    const queryConfig = joinConfig.query || {};
    const groupBy = Array.isArray(queryConfig?.groupBy) ? queryConfig.groupBy : [];
    const tileColumns = getJoinTileColumns(layerConfig);
    const groupBySet = new Set(groupBy);

    // Resolve a join output column to its SELECT expression: prefer the join
    // query's own column expression, else fall back to the bare column name for
    // a GROUP BY key (valid to select alongside the aggregate). Returns null for
    // anything the join can't produce (e.g. a base-table column).
    const resolveAttr = (col) =>
        getJoinQueryAttributeByOutputName(layerConfig, col) || (groupBySet.has(col) ? col : null);
    const isJoinColumn = (col) => Boolean(col) && (Boolean(resolveAttr(col)) || tileColumns.includes(col));

    // Every column the query needs the join to supply: the colored column when
    // it's joined, plus any static or dynamic filter column that targets a
    // joined column. Base-table columns are excluded — the geometry side
    // supplies those — so a filter on a base column doesn't force a join.
    const filterColumns = Object.keys(layerConfig?.filter || {});
    const dynamicFilterColumns = (layerConfig?.["dynamic-filters"] || [])
        .filter((dynamicFilter) => Array.isArray(dynamicFilter?.values) && dynamicFilter.values.length > 0)
        .map((dynamicFilter) => dynamicFilter.column_name);
    const joinedFilterColumns = [...filterColumns, ...dynamicFilterColumns].filter(isJoinColumn);
    const coloredColumnIsJoined = isJoinColumn(dataColumn);

    // No join needed unless the colored column or a filter targets the join.
    if (!coloredColumnIsJoined && joinedFilterColumns.length === 0) {
        return null;
    }

    const requiredColumns = Array.from(new Set([
        joinConfig.joinColumn,
        ...(coloredColumnIsJoined ? [dataColumn] : []),
        ...joinedFilterColumns,
    ].filter(Boolean)));
    const resolved = requiredColumns
        .map((col) => ({ col, attr: resolveAttr(col) }))
        .filter((entry) => entry.attr);

    return {
        viewId: joinConfig.source.viewId,
        localKey: joinConfig.featureKeyColumn,
        joinKey: joinConfig.joinColumn,
        options: { ...buildJoinFilterOptions(queryConfig), groupBy },
        attributes: resolved.map((entry) => entry.attr),
        // Expose everything except the join key as tile/feature columns so tile
        // rendering and client-side map filters can read the joined values too.
        tileCols: resolved.filter((entry) => entry.col !== joinConfig.joinColumn).map((entry) => entry.col),
    };
};

/**
 * Reuses the saved category legend rows as the source of truth for labels and
 * colors, then narrows that legend to only the categories present after the
 * current runtime filters have been applied.
 */
const getCategoryLegendFromFilteredData = (layer, filteredData = []) => {
    const dataColumn = layer?.["data-column"];
    const baseLegend = layer?.__runtimeBaseLegendData || layer?.["legend-data"] || [];
    const baseCategoryData = layer?.__runtimeBaseCategoryData || layer?.["category-data"] || [];
    const colorSet = layer?.["color-set"] || [];

    const baseLegendByValue = new Map(
        (baseCategoryData || []).map((row, index) => [
            String(row?.[dataColumn]),
            baseLegend[index] || null,
        ])
    );

    return (filteredData || [])
        .map((row, index) => {
            const value = row?.[dataColumn];
            if (value === undefined || value === null) return null;
            const savedLegendRow = baseLegendByValue.get(String(value));
            return {
                color: savedLegendRow?.color || colorSet[index % colorSet.length] || "#ccc",
                label: savedLegendRow?.label || String(value),
            };
        })
        .filter(Boolean);
};

/**
 * Produces a persist-safe copy of map state by restoring each layer's base
 * (unfiltered) legend/category data and dropping the runtime-only scratch
 * fields. The runtime legend refresh rewrites `legend-data`/`category-data`
 * in place to reflect active filters, stashing the originals under
 * `__runtimeBase*`. That filtered legend is a live-display concern only and
 * must never be written back into the saved symbology — so edit-mode
 * persistence saves this sanitized copy instead of raw state. Returns the input
 * untouched when there's nothing to strip (the common case), so the normal save
 * path pays no cloning cost.
 */
const stripRuntimeLegendState = (state) => {
    const hasRuntimeState = state?.__symbologyRefreshAt !== undefined || Object.values(state?.symbologies || {}).some((symb) =>
        Object.values(symb?.symbology?.layers || {}).some(
            (layer) =>
                layer &&
                (layer.__runtimeBaseLegendData ||
                    layer.__runtimeBaseCategoryData ||
                    layer.__runtimeLegendFilterKey)
        )
    );
    if (!hasRuntimeState) return state;

    const clean = cloneDeep(state);
    // Runtime-only refresh signal — never persist it into the saved config.
    delete clean.__symbologyRefreshAt;
    Object.values(clean.symbologies || {}).forEach((symb) => {
        Object.values(symb?.symbology?.layers || {}).forEach((layer) => {
            if (!layer) return;
            if (layer.__runtimeBaseLegendData) {
                layer["legend-data"] = layer.__runtimeBaseLegendData;
            }
            if (layer.__runtimeBaseCategoryData) {
                layer["category-data"] = layer.__runtimeBaseCategoryData;
            }
            delete layer.__runtimeBaseLegendData;
            delete layer.__runtimeBaseCategoryData;
            delete layer.__runtimeLegendFilterKey;
        });
    });
    return clean;
};

export const MapSection = ({ value, onChange, isEdit, onHandle }) => {
    // const {falcor, falcorCache} = useFalcor();
    // controls: symbology, more, filters: lists all interactive and dynamic filters and allows for searchParams match.

// console.log("Map::value", value);
// console.log("Map::isEdit", isEdit);

    const { falcor, falcorCache, pgEnv, apiLoad, mapeditorKeys } = React.useContext(CMSContext);
    const { pageState, setPageState, updatePageStateFilters } =  React.useContext(PageContext) || {}
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const damaMapT = { ...damaMapTheme, ...getComponentTheme(themeFromContext, 'damaMap') };
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const cachedDisplay = cachedData.display || {};
    const [state, setState] = useImmer({
        tabs: cachedData.tabs || EMPTY_TABS,
        symbologies: cachedData.symbologies || EMPTY_OBJECT,
        display: {
            ...cachedDisplay,
            _functions: cachedDisplay._functions || cachedData._functions || { providers: [], subscribers: [] },
        },
        isEdit,
        setInitialBounds: cachedData.setInitialBounds || false,
        initialBounds: cachedData.initialBounds || null,
        hideControls: cachedData.hideControls || false,
        blankBaseMap: cachedData.blankBaseMap || false,
        height: cachedData.height || "full",
        zoomPan: typeof cachedData.zoomPan === 'boolean' ? cachedData.zoomPan : true,
        zoomToFitBounds: cachedData.zoomToFitBounds || false,
        legendPosition: cachedData.legendPosition || Object.keys(PANEL_POSITION_OPTIONS)[2], //defaults to `top-right`
        pluginControlPosition: cachedData.pluginControlPosition || Object.keys(PANEL_POSITION_OPTIONS)[0], //defaults to `top-left`
        basemapStyle: cachedData.basemapStyle || "Default"
    });

    const doApiLoad = React.useCallback((opts) => {
        // On an explicit Refresh, invalidate the selected symbology's cached row
        // so the re-fetch pulls the latest saved config from the source instead
        // of falcor's client cache. Ordinary (initial) loads pass nothing and
        // stay cache-friendly. Cover string + numeric id forms.
        if (opts?.invalidateId != null && typeof falcor?.invalidate === "function") {
            const ids = [...new Set([opts.invalidateId, +opts.invalidateId])]
                .filter((v) => v != null && !(typeof v === "number" && Number.isNaN(v)));
            mapeditorKeys.forEach((c) => {
                const [app] = c.split("+");
                ids.forEach((id) => falcor.invalidate(["dms", "data", app, "byId", id]));
            });
        }
        return mapeditorKeys.reduce((a, c) => {
            // `mapeditorKeys` entries are `{app}+{patternInstance}` (e.g.
            // 'mitigat-ny-prod+map_editor_test'). Symbology rows live at type
            // `{patternInstance}|symbology` — build the full type from the
            // format's leaf kind.
            const [app, patternInstance] = c.split("+");
            const format = {
                ...cloneDeep(mapeditorFormat),
                app,
                type: `${patternInstance}|${mapeditorFormat.type}`,
            };
            return a.then(aa => {
                return apiLoad({
                    ...format,
                    format,
                    children: [
                        {   type: () => {},
                            action: "list",
                            path: "/"
                        }
                    ]
                }).then(cc => [...aa, ...cc]);
            })
        }, Promise.resolve([]));
    }, [apiLoad, mapeditorKeys, falcor]);

    const interactionOptions = useMemo(() => {
        const mapLayers = Object.values(state.symbologies || {}).flatMap((symbology) =>
            Object.values(symbology?.symbology?.layers || {}).map((layer, index) => ({
                label: layer.name?.length && layer.name !== " " ? layer.name : `layer - ${index + 1}`,
                value: layer.id,
            }))
        );

        return { mapLayers };
    }, [state.symbologies]);

    /**
     * Exposes live map state and the map-specific API to the outer section settings shell.
     * Map Settings is rendered outside this component tree, so it needs this handle bridge.
     */
    /**
     * Runtime-only legend refresh for DMS map layers.
     *
     * Interactive filter switching already swaps the active layer config, but
     * dynamic-filter value changes only update rendered features. This effect
     * keeps legend data in sync with those live filtered results without
     * persisting temporary legend changes back into the saved symbology.
     */
    useEffect(() => {
        if (!onHandle) return;
        onHandle({
            state,
            setState,
            mapAPI: {
                state: { ...state, interactionOptions },
                setState,
                doApiLoad
            }
        });
    }, [onHandle, state, setState, doApiLoad, interactionOptions]);

// console.log("Map::pageState", pageState);

    const [mapLayers, setMapLayers] = useImmer([]);

    // Tracks the last-seen symbology-refresh signal (bumped by the settings
    // "Refresh" action). When it changes, the layer-build effect below rebuilds
    // every layer instance from fresh state instead of keeping the old ones by id.
    const symbologyRefreshRef = useRef(state.__symbologyRefreshAt);

    // Symbologies that have been visible at least once — used by the Layer
    // Library mode to defer layer construction (see the updateLayers effect).
    const everVisibleRef = useRef(new Set());

    /**
     * Shareable map state (opt-in via display.shareableState, view mode only)
     * expressed as PAGE VARIABLES — the page owns the URL. Two vars, auto-
     * registered by the platform (deriveMapShareVariables in pages/_utils) when
     * a section has shareableState:
     *   - `layers` = the visible symbology-id set (comma-joined).
     *   - `<layer.searchParamKey>` = an interactive symbology's selected variant,
     *     UNIFIED onto the interactive-filter's own page-variable binding (the
     *     same key a county-template map consumes) instead of a map-only `f_<id>`.
     *
     * READ is folded into the `dataPageFilters` effect below — both vars arrive
     * through `pageState.filters`, so visibility + the multi-symbology interactive
     * binding + dynamic-filters are applied together in one ordered setState.
     * This effect is the WRITE side, routed through `updatePageStateFilters` (the
     * page's URL owner — the same producer path click-filters use). We do NOT
     * touch `useSearchParams` here: writing the URL from the map fights the page's
     * URL ownership and, under React Compiler, ping-pongs into a reload loop.
     */
    const shareEnabled = !isEdit && Boolean(state.display?.shareableState);
    const shareWritePrimedRef = useRef(null);
    // Share-state visibility comes from the PAGE (source of truth). The WRITE
    // (state→page) must not fire until the first READ (page→state) has reconciled
    // THIS mount — otherwise a remount (which reseeds visibility from the saved
    // default) writes that default back over the page's selection, bouncing
    // navigate↔remount. It's state (not a ref) so a remount re-defers, and it's a
    // WRITE-effect dependency so the write re-primes once reconciliation happens.
    const [shareReadReconciled, setShareReadReconciled] = React.useState(false);

    useEffect(() => {
        if (!shareEnabled || typeof updatePageStateFilters !== 'function') return;
        if (!shareReadReconciled) return;
        const visibleIds = Object.keys(state.symbologies || {}).filter(id => state.symbologies[id]?.isVisible);
        const nextFilters = [{ searchKey: 'layers', values: visibleIds }];
        visibleIds.forEach(id => {
            Object.values(state.symbologies[id]?.symbology?.layers || {}).forEach(layer => {
                const options = layer['interactive-filters'] || [];
                const key = layer.searchParamKey;
                const index = layer.selectedInteractiveFilterIndex;
                if (!options.length || !key || index === undefined || index === null) return;
                const variant = options[index];
                const value = variant?.searchParamValue ?? variant?.label;
                if (value !== undefined && value !== null) nextFilters.push({ searchKey: key, values: [String(value)] });
            });
        });
        const serialized = JSON.stringify(nextFilters);
        // First run after reconciliation: prime the page-synced baseline, no write.
        if (shareWritePrimedRef.current === null) { shareWritePrimedRef.current = serialized; return; }
        if (shareWritePrimedRef.current === serialized) return;
        shareWritePrimedRef.current = serialized;
        // Idempotency vs the PAGE: never write what the page already holds.
        const pageAlreadyMatches = nextFilters.every(nf => {
            const cur = (pageState?.filters || []).find(f => f.searchKey === nf.searchKey);
            const curVals = Array.isArray(cur?.values) ? cur.values : (cur?.values == null ? [] : [cur.values]);
            return isEqual(curVals.map(String), nf.values.map(String));
        });
        if (pageAlreadyMatches) return;
        updatePageStateFilters(nextFilters);
    }, [shareEnabled, state.symbologies, pageState.filters, shareReadReconciled]);

    const isReady = useMemo(() => {
        return Object.values(state.symbologies || {}).some(symb => Object.keys(symb?.symbology?.layers || {}).length > 0);
    }, [state.symbologies]);

    const activeSym = useMemo(() => {
        return Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
    }, [state.symbologies])

    const activeSymSymbology = useMemo(()=> {
        return state.symbologies[activeSym]?.symbology || {};
    }, [state.symbologies[activeSym]])

// console.log("Map::activeSymSymbology", activeSymSymbology);

    const activeLayer = useMemo(() => {
        return activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
    },[activeSymSymbology])

// console.log("Map::activeLayer", activeLayer);

    const pageFilters = useMemo(() => {
        return pageState.filters
    },[pageState])

    /**
     * `pageState.filters` now contains both "real" page filters and temporary
     * interaction filters (`type: 'action'`) published by components such as
     * Map/Card/Spreadsheet on hover or click.
     *
     * The map's symbology/filter sync should only react to real data/search
     * filters. If action filters are included here, a hover/click interaction
     * would be treated like a true map filter change, which can trigger map
     * state updates and visible layer/source refreshes.
     *
     * To avoid that, `dataPageFilters` keeps only the non-action filters that
     * should participate in the map's normal filter synchronization flow.
     */
    const dataPageFilters = useMemo(() => {
        return (pageFilters || []).filter(filter => filter?.type !== 'action');
    }, [pageFilters]);

    /**
     * `pageState.filters` receives a new array reference whenever action filters
     * are set/cleared, even if the underlying non-action filters did not change.
     *
     * This ref stores the previous non-action filter snapshot so we can compare
     * it with the current `dataPageFilters` value and skip the map filter-sync
     * effect when only temporary interaction state changed.
     *
     * In practice, this prevents hover/click provider updates from retriggering
     * expensive map sync work and causing the layer refresh behavior we saw
     * earlier.
     */
    // Seed with `null` (not the mount-time value) so the FIRST run counts as a
    // change and applies page filters already present at load (e.g. from the
    // URL) into the layer dynamic-filters. Seeding with the current value made
    // the first isEqual() true, so load-time page filters were never synced and
    // only a per-filter defaultValue would show.
    const prevDataPageFiltersRef = useRef(null);
    useEffect(() => {
        if (isEqual(prevDataPageFiltersRef.current, dataPageFilters)) {
            return;
        }
        prevDataPageFiltersRef.current = dataPageFilters;

        // Proceed if ANY symbology participates in the page-variable system:
        // a dynamic-filter, an interactive-filter UNIFIED onto a `searchParamKey`
        // (the multi-symbology variant binding), or — in view mode — the `layers`
        // visibility share var. (`activeLayer`/`activeSym` are no longer read here;
        // every symbology binds its own page vars independently.)
        const usePageFilters = shareEnabled || Object.values(state.symbologies || {}).some(symb =>
            Object.values(symb?.symbology?.layers || {}).some(layer =>
                layer['dynamic-filters']?.length ||
                ((layer['interactive-filters'] || []).length && layer.searchParamKey)));

        if(!usePageFilters) return;

        // A dynamic/interactive filter binds to a page filter by key: its
        // `searchParamKey` (falling back to `column_name`) matched against a page
        // filter's `searchKey`.
        const getSearchParamKey = f => f.searchParamKey || f.column_name;

        // `layers` visibility share var (view mode only, gated by shareEnabled).
        // A present-but-empty `layers` means "default state" — treat as no
        // override so a bare/stale share link doesn't load an all-off map.
        const layersFilter = shareEnabled ? (dataPageFilters || []).find(f => f.searchKey === 'layers') : null;
        const rawLayers = layersFilter?.values;
        // `layers` arrives already split on the page-var delimiter (`|||`). Also
        // split each element on comma so LEGACY `?layers=a,b` links (the pre-unify
        // shape) still resolve — new writes use the page-var `|||` convention.
        const toIds = v => String(v).split(',').map(s => s.trim()).filter(Boolean);
        const wantedIds = Array.isArray(rawLayers) ? rawLayers.flatMap(toIds)
            : (typeof rawLayers === 'string' ? toIds(rawLayers) : []);
        const applyVisibility = Boolean(layersFilter) && wantedIds.length > 0;
        // The page→state reconciliation has now run this mount — release the WRITE
        // effect (bails if already true, so no extra renders on later runs).
        setShareReadReconciled(true);

        setState(draft => {
            // 1. Visibility from `layers`. Mutations are guarded on an ACTUAL
            //    change — otherwise the mlLayer.layout spread churns a new immer
            //    reference every run and the WRITE effect ping-pongs.
            if (applyVisibility) {
                Object.keys(draft.symbologies || {}).forEach(symId => {
                    const entry = draft.symbologies[symId];
                    const nextVisible = wantedIds.includes(String(symId));
                    if (entry.isVisible === nextVisible) return;
                    entry.isVisible = nextVisible;
                    Object.values(entry.symbology?.layers || {}).forEach(layer => {
                        (layer.layers || []).forEach(mlLayer => {
                            mlLayer.layout = { ...(mlLayer.layout || {}), visibility: nextVisible ? 'visible' : 'none' };
                        });
                    });
                });
            }

            // 2. Interactive-filter variant per symbology — the UNIFIED
            //    multi-symbology bridge: every symbology's interactive layer picks
            //    its variant from its OWN `searchParamKey` page var (was single
            //    `activeSym`/`activeLayer`). Idempotent: only set when it changes.
            Object.values(draft.symbologies || {}).forEach(symb => {
                Object.values(symb?.symbology?.layers || {}).forEach(layer => {
                    const options = layer['interactive-filters'] || [];
                    const key = layer.searchParamKey;
                    if (!options.length || !key) return;
                    const pageValue = (dataPageFilters || []).find(f => f.searchKey === key)?.values;
                    const values = Array.isArray(pageValue) ? pageValue : [pageValue];
                    const idx = options.findIndex(f =>
                        values.some(v => String(f.searchParamValue) === String(v) || String(f.label) === String(v)));
                    if (idx !== -1 && layer.selectedInteractiveFilterIndex !== idx) {
                        layer.selectedInteractiveFilterIndex = idx;
                    }
                });
            });

            // 3. Sync EVERY symbology's dynamic filters to the page bus. Each
            //    filter's value is a pure function of the current page filters:
            //    the page value if present, else the filter's `defaultValue`, else
            //    empty. Resetting absent filters (rather than skipping them) is
            //    what makes clearing a page filter clear the map filter instead of
            //    leaving a stale value behind.
            Object.values(draft.symbologies || {})
                .forEach(symb => {
                    Object.values(symb?.symbology?.layers || {})
                        .filter(l => l['dynamic-filters']?.length)
                        .forEach(layer => {
                            layer['dynamic-filters'].forEach(filter => {
                                const isNumeric = filter.dataType === 'numeric';
                                const pageValues = (dataPageFilters || [])
                                    .find(f => f.searchKey === getSearchParamKey(filter))?.values;

                                filter.values =
                                    Array.isArray(pageValues) && pageValues.length ? pageValues.map(v => isNumeric ? +v : v) :
                                        (typeof pageValues === 'string' && pageValues !== '') ? [isNumeric ? +pageValues : pageValues] :
                                            (typeof pageValues === 'number') ? [pageValues] :
                                                filter.defaultValue?.length ? [isNumeric ? +filter.defaultValue : filter.defaultValue] : [];
                            })
                        })
                })
        })
    }, [dataPageFilters])

    const dynamicFilterOptions = useMemo(() => {
        return (activeLayer?.['dynamic-filters'] || []);
    },[activeLayer]);

// console.log("Map::dynamicFilterOptions", dynamicFilterOptions);

    useEffect(() => {
        const getFilterBounds = async () => {
            const symbName = Object.keys(state.symbologies)[0];
            const symbPathBase = `symbologies['${symbName}']`;
            const symbData = get(state, symbPathBase, {})

            const newExtent = await fetchBoundsForFilter(symbData, falcor, pgEnv, dynamicFilterOptions);
            // if (!newExtent || newExtent === "undefined") return;
            setState((draft) => {
                let parsedExtent;
                try {
                    parsedExtent = typeof newExtent === "string" ? JSON.parse(newExtent) : newExtent;
                } catch (e) {
                    console.warn("[Map] Invalid filter bounds extent:", newExtent);
                    return;
                }
                const coordinates = parsedExtent?.coordinates[0];
                const mapGeom = coordinates?.reduce((bounds, coord) => {
                return bounds.extend(coord);
                }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

                if(mapGeom && Object.keys(mapGeom).length > 0) {
                    draft.symbologies[activeSym].symbology.zoomToFilterBounds = [mapGeom['_sw'], mapGeom['_ne']];
                }
            })
        }
        if (
            dynamicFilterOptions.length > 0 &&
            dynamicFilterOptions.some((dynFilter) => dynFilter.zoomToFilterBounds) &&
            dynamicFilterOptions.some((dynFilter) => dynFilter?.values?.length > 0)
        ) {
            getFilterBounds();
        } else {
        if(state?.symbologies[activeSym]?.symbology?.length > 0) {
            setState((draft) => {
                 draft.symbologies[activeSym].symbology.zoomToFilterBounds = [];
            });
        }
        }
    }, [dynamicFilterOptions, dataPageFilters]);

    /**
     * Keep runtime legend data aligned with the currently active layer filters.
     * When dynamic filters are active, refetch filtered legend inputs and store
     * the derived legend state on the live layer only. When filters clear,
     * restore the layer's original saved legend values.
     */
    useEffect(() => {
        // Runs in BOTH edit and view so the legend looks the same in both modes.
        // Edit-mode persistence strips the transient filtered legend back to the
        // base (see stripRuntimeLegendState in the onChange effect), so running
        // the refresh here never bakes a filtered legend into the saved config.
        if (!activeSym || !isReady) return;

        let cancelled = false;

        const refreshLegendData = async () => {
            const visibleSymbologies = Object.entries(state.symbologies || {})
                .filter(([, symb]) => symb?.isVisible);

            for (const [symbologyId, symb] of visibleSymbologies) {
                const layers = Object.values(symb?.symbology?.layers || {});

                for (const layer of layers) {
                    /**
                     * Interactive layers keep the active variant nested under
                     * `interactive-filters`, while the top-level layer remains
                     * marked as `"interactive"`. Resolve the effective active
                     * legend type here so dynamic-filter legend refresh can
                     * still branch into categories / choropleth / circles.
                     */
                    const selectedInteractiveFilterIndex = layer?.selectedInteractiveFilterIndex;
                    const layerType = layer?.["layer-type"] === "interactive"
                        ? get(layer, `['interactive-filters'][${selectedInteractiveFilterIndex}]['layer-type']`)
                        : layer?.["layer-type"];
                    const dataColumn = layer?.["data-column"];
                    const viewId = layer?.view_id;
                    // buildJoinOptions decides whether a join is actually needed
                    // (colored column joined, or a filter targets a joined column)
                    // and returns null otherwise.
                    const joinOptions = buildJoinOptions(layer, dataColumn);
                    const activeLegendFilters = buildLayerUdaFilterOptions({
                        layerFilter: layer?.filter,
                        dynamicFilters: layer?.["dynamic-filters"],
                        filterMode: layer?.filterMode,
                    });

                    /**
                     * Recompute the legend from the layer's CURRENT filter
                     * envelope (static + dynamic) on mount and whenever it
                     * changes — NOT only when a dynamic filter is active. This is
                     * the invariant: the component derives legends the same way
                     * the editor does, so a layer classified by a static filter
                     * (e.g. a selected hazard + an exclude) shows the correct
                     * recomputed legend instead of a possibly-stale saved one.
                     * `custom` bins are exempted in the choropleth branch.
                     *
                     * `runtimeLegendKey` fingerprints the full envelope so we
                     * fetch once per unique envelope (dedup below) — it includes
                     * bin method / bin count / interactive variant so a change to
                     * any of them recomputes.
                     */
                    const runtimeLegendKey = JSON.stringify({
                        layerType,
                        viewId,
                        dataColumn,
                        binMethod: layer?.["bin-method"] || null,
                        numBins: layer?.["num-bins"] || null,
                        variant: selectedInteractiveFilterIndex ?? null,
                        filterMode: layer?.filterMode || "all",
                        filters: activeLegendFilters || null,
                        join: joinOptions,
                    });

                    // Can't compute a legend without a data column + view.
                    // (custom bins are handled in the choropleth branch.)
                    if (!dataColumn || !viewId) {
                        continue;
                    }

                    if (layer?.__runtimeLegendFilterKey === runtimeLegendKey) {
                        continue;
                    }

                    if (layerType === "categories") {
                        // Layers authored WITHOUT `category-data` (section-embedded symbologies)
                        // keep their authored legend — narrowing would replace the authored
                        // labels/colors with raw values on a fallback palette. Decide that
                        // BEFORE fetching: the recompute query is useless for them, and it can
                        // be actively harmful — such layers may carry a comma-joined
                        // `data-column` (the tile `?cols=` carrier, e.g. the reliability LOTTR
                        // layer's "lottr_amp,lottr_midd,lottr_pmp,lottr_we"), which this
                        // single-column query template compiles into a row-constructor exclude
                        // → Postgres "argument of AND must be type boolean, not type record",
                        // and the failed request disrupts every path batched with it.
                        const baseCategoryData = layer?.__runtimeBaseCategoryData || layer?.["category-data"] || [];
                        if (!baseCategoryData.length) {
                            setState((draft) => {
                                const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                                if (draftLayer) draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                            });
                            continue;
                        }

                        const effectiveViewId = joinOptions?.viewId ?? viewId;
                        const options = JSON.stringify({
                            groupBy: [dataColumn.split("AS ")[0]],
                            exclude: { [dataColumn.split("AS ")[0]]: ["null"] },
                            orderBy: { "2": "desc" },
                            ...activeLegendFilters,
                        });

                        const response = await falcor.get([
                            "uda", pgEnv, "viewsById", effectiveViewId, "options", options,
                            "dataByIndex", { from: 0, to: 100 }, [dataColumn, "count(1)::int as count"]
                        ]);

                        if (cancelled) return;

                        // The falcor range materializes as an OBJECT keyed by index
                        // ("0","1",…), not an array — checking `.length` on it reads
                        // undefined and every populated category legend collapsed to
                        // "No data". Normalize to ordered rows (unboxing atoms) first.
                        const dataByIndexObj = get(
                            response,
                            ["json", "uda", pgEnv, "viewsById", effectiveViewId, "options", options, "dataByIndex"],
                            {}
                        );
                        if (dataByIndexObj?.$__status === "error") {
                            // parity with the choropleth branch: keep the last-good
                            // legend on a server error, never wipe it
                            continue;
                        }
                        const filteredData = Object.keys(dataByIndexObj || {})
                            .filter((key) => /^\d+$/.test(key))
                            .sort((a, b) => +a - +b)
                            .map((key) => {
                                const row = dataByIndexObj[key];
                                if (!row || typeof row !== "object") return null;
                                return Object.fromEntries(Object.entries(row).map(([col, v]) => [
                                    col,
                                    v && typeof v === "object" && "value" in v ? v.value : v,
                                ]));
                            })
                            .filter(Boolean);

                        // Empty filtered set → explicit "No data" (parity with
                        // the choropleth branch); otherwise narrow the saved
                        // category legend to the categories still present.
                        const nextLegendData = filteredData.length
                            ? getCategoryLegendFromFilteredData(layer, filteredData)
                            : [{ label: "No data" }];

                        setState((draft) => {
                            const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                            if (!draftLayer) return;
                            if (!draftLayer.__runtimeBaseLegendData) {
                                draftLayer.__runtimeBaseLegendData = cloneDeep(draftLayer["legend-data"] || []);
                            }
                            if (!draftLayer.__runtimeBaseCategoryData) {
                                draftLayer.__runtimeBaseCategoryData = cloneDeep(draftLayer["category-data"] || []);
                            }
                            if (!isEqual(draftLayer["legend-data"], nextLegendData)) {
                                draftLayer["legend-data"] = nextLegendData;
                            }
                            if (!isEqual(draftLayer["category-data"], filteredData)) {
                                draftLayer["category-data"] = filteredData;
                            }
                            draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                        });
                    }
                    else if (layerType === "choropleth" || layerType === "circles") {
                        const binMethod = layer?.["bin-method"] || "ckmeans";

                        // Custom bins are author-defined and fixed. The server
                        // colorDomain endpoint has no "custom" method (it errors
                        // with empty breaks), and filtering never changes custom
                        // breaks. Never recompute — leave the saved legend as-is.
                        if (binMethod === "custom") {
                            continue;
                        }

                        const domainOptions = JSON.stringify({
                            column: dataColumn,
                            numbins: layer?.["num-bins"] || 9,
                            method: binMethod,
                            ...activeLegendFilters,
                            ...(joinOptions ? { join: joinOptions } : {}),
                        });

                        const response = await falcor.get([
                            "uda", pgEnv, "viewsById", +viewId, "colorDomain", domainOptions
                        ]);

                        if (cancelled) return;

                        const domainResult = get(
                            response,
                            ["json", "uda", pgEnv, "viewsById", +viewId, "colorDomain", domainOptions],
                            {}
                        );

                        // A genuine/transient server error (e.g. the numeric
                        // `exclude` cast crash) → keep the last-good legend; never
                        // wipe on a failure.
                        if (domainResult?.error) {
                            continue;
                        }

                        // Empty filtered set (count:0, no error → no breaks): a
                        // legitimate "nothing matched" result. Show an explicit
                        // "No data" legend instead of retaining a stale range.
                        // (count is the empty signal, not the bounds.)
                        if (!(domainResult?.breaks?.length)) {
                            setState((draft) => {
                                const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                                if (!draftLayer) return;
                                if (!draftLayer.__runtimeBaseLegendData) {
                                    draftLayer.__runtimeBaseLegendData = cloneDeep(draftLayer["legend-data"] || []);
                                }
                                const noData = [{ label: "No data" }];
                                if (!isEqual(draftLayer["legend-data"], noData)) {
                                    draftLayer["legend-data"] = noData;
                                }
                                draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                            });
                            continue;
                        }

                        // The color ramp doesn't change with filters. Prefer the
                        // layer's explicit `color-range`, but fall back to the ramp
                        // already baked into the saved paint when it's absent —
                        // otherwise the recomputed legend comes out colorless and
                        // overwrites the good saved legend-data.
                        const effectiveColorRange =
                            (Array.isArray(layer?.["color-range"]) && layer["color-range"].length)
                                ? layer["color-range"]
                                : extractStepColors(getSavedRampPaint(layer));

                        const paintResult = choroplethPaint(
                            dataColumn,
                            domainResult?.max,
                            effectiveColorRange,
                            layer?.["num-bins"] || 9,
                            binMethod,
                            domainResult?.breaks || [],
                            layer?.["category-show-other"] || "#ccc",
                            layer?.["legend-orientation"] || "vertical"
                        );

                        const nextLegendData = paintResult?.legend || [];

                        setState((draft) => {
                            const draftLayer = draft.symbologies?.[symbologyId]?.symbology?.layers?.[layer.id];
                            if (!draftLayer) return;
                            if (!draftLayer.__runtimeBaseLegendData) {
                                draftLayer.__runtimeBaseLegendData = cloneDeep(draftLayer["legend-data"] || []);
                            }
                            if (!isEqual(draftLayer["legend-data"], nextLegendData)) {
                                draftLayer["legend-data"] = nextLegendData;
                            }
                            draftLayer.__runtimeLegendFilterKey = runtimeLegendKey;
                        });
                    }
                }
            }
        };

        refreshLegendData();

        return () => {
            cancelled = true;
        };
    }, [activeSym, falcor, isEdit, isReady, pgEnv, setState, state.symbologies]);

    const arePluginsLoaded = Object.values((state.symbologies || {})).some(symb => Object.keys((symb?.symbology?.plugins || {})).length > 0);

    useEffect(() => {
        // -----------------------
        // Update map layers on map
        // when state.symbology.layers update
        // -----------------------

        // A symbology "Refresh" bumps `__symbologyRefreshAt`. On that signal we
        // must rebuild the layer instances from fresh config (they're kept by id
        // otherwise), so all their data/tile/legend fetches re-run. Ordinary
        // symbology changes (filters, etc.) keep the existing instances.
        const forceRebuild = symbologyRefreshRef.current !== state.__symbologyRefreshAt;
        symbologyRefreshRef.current = state.__symbologyRefreshAt;

        // console.log('symbology layers effect')
        const updateLayers = async () => {
            if(isReady) {
                // Layer Library mode defers layer construction: with many
                // symbologies embedded (Freight Atlas ships 31) only the ones
                // that have been visible get SymbologyViewLayer instances +
                // style registration. Once created they stay (toggling off
                // flips layout.visibility — no source teardown). Sections
                // without the library panel keep today's eager behavior.
                const isLibraryPanel = state.display?.layerPanel === 'library';
                Object.values(state.symbologies || {}).forEach(symb => {
                    if (symb?.isVisible && symb?.id !== undefined) everVisibleRef.current.add(String(symb.id));
                });
                let allLayers = (Object.values(state.symbologies)
                    .filter(symb => !isLibraryPanel || symb?.isVisible || everVisibleRef.current.has(String(symb?.id)))
                    .reduce((out,curr) => {
                    let ids = out.map(d => d.id)
                        let newSymbLayers = Object.keys(curr?.symbology?.layers)
                        .reduce((layerOut, layerKey) => {
                            if( !ids.includes(layerKey) ) {
                                layerOut[layerKey] = curr?.symbology?.layers?.[layerKey]
                            }
                            return layerOut
                        },{})
                  let newPlugins = Object.keys(curr?.symbology?.plugins || {})
                        .reduce((pluginOut, pluginKey) => {
                            if( !ids.includes(pluginKey) ) {
                                pluginOut[pluginKey] = curr?.symbology?.plugins?.[pluginKey]
                            }
                            return pluginOut
                        },{})


                    return [...out,  ...Object.values(newSymbLayers), ...Object.values(newPlugins)]

                },[]))

                setMapLayers(draftMapLayers => {
                    // On a refresh, start from an empty set so every layer is
                    // recreated (new SymbologyViewLayer/PluginLayer) → all their
                    // effects re-run and re-hit the APIs with the fresh config.
                    const baseLayers = forceRebuild ? [] : draftMapLayers;
                    let currentLayerIds = baseLayers.map(d => d.id).filter(d => !!d)
                    let newLayers = allLayers
                      .filter(d => d)
                      .filter(d => !currentLayerIds.includes(d.id))
                      .sort((a,b) => b.order - a.order)
                      .map(l => {
                        if(l.type === PLUGIN_TYPE) {
                            //console.log("plugin layer")
                            return new PluginLayer(l)
                        } else {
                            return new SymbologyViewLayer(l)
                        }
                      })

                    const oldIds = allLayers.map(d => d.id)
                    let oldLayers = baseLayers.filter(d => {
                        return oldIds.includes(d.id)
                    })

                    const out = [
                        // keep existing layers & filter
                        ...oldLayers,
                        // add new layers
                        ...newLayers
                    ].sort((a,b) => b.order - a.order)
                    return out
                })
            }
        }
        updateLayers()
    }, [state.symbologies, isReady, state.__symbologyRefreshAt])

    //I want to check to see if the data-column is being updated in the symbology
    //Basically, the data-column update is not making it to the map layer. We need to know why
    //console.log("DMS Map state.symbologies::", Object.values(state.symbologies))
    //as of 8:58am 9/4, it is NOT making it to the symbology
    //HOWEVER -- it is propegating to the `pluginData` field.


    const layerProps = useMemo(() =>  {
        return Object.values(state.symbologies).reduce((out,curr) => {
            return {
                ...out,
                ...Object.keys((curr?.symbology?.layers || {}))
                    .reduce((acc, layerId) => ({
                            ...acc,
                            [layerId]: {...(curr?.symbology?.layers?.[layerId] || {}), zoomToFitBounds: state.zoomToFitBounds, zoomToFilterBounds: curr.symbology.zoomToFilterBounds }}
                        ), {})
            }
        }, {})
    }, [state?.symbologies, state.zoomToFitBounds]);

    const isHorizontalLegendActive = Object.values(state?.symbologies)
      ?.filter((symb) => symb.isVisible)
      .some((symb) => {
        return Object.values(symb?.symbology?.layers).some(
          (symbLayer) => symbLayer["legend-orientation"] === "horizontal"
        );
      });


    const interactiveFilterIndicies = useMemo(() => {
        // Track every symbology's visibility + every layer's selected
        // interactive filter, so the flatten effect below re-runs for
        // non-active symbologies too (Layer Library mode). Single-symbology
        // sections change this value exactly when they did before.
        return JSON.stringify(
            Object.keys(state.symbologies || {}).map(symId => {
                const symb = state.symbologies[symId];
                return [
                    symId,
                    symb?.isVisible ? 1 : 0,
                    ...Object.values(symb?.symbology?.layers || {})
                        .map(layer => layer?.selectedInteractiveFilterIndex ?? null)
                ];
            })
        );
    }, [state.symbologies]);

    useEffect(() => {
        setState((draft) => {
          Object.keys(draft.symbologies)
            .forEach(topSymbKey => {
                const curTopSymb = draft.symbologies[topSymbKey];
                Object.keys(curTopSymb.symbology.layers)
                  .forEach((lKey) => {
                    const layer = draft.symbologies[topSymbKey].symbology.layers[lKey];
                    const draftFilters = layer['interactive-filters'] || {};
                    const draftDynamicFilters = layer['dynamic-filters'];
                    const draftFilterIndex = +layer.selectedInteractiveFilterIndex;
                    const draftInteractiveFilter = draftFilters?.[draftFilterIndex]

                    if(draftInteractiveFilter) {
                      const newSymbology = {
                        ...layer,
                        ...draftInteractiveFilter,
                        order: layer.order,
                        "layer-type": "interactive",
                        "click-filter": layer["click-filter"] ?? draftInteractiveFilter["click-filter"],
                        "interactive-filters": draftFilters,
                        "dynamic-filters": draftDynamicFilters,
                        selectedInteractiveFilterIndex: draftFilterIndex
                      };

                      newSymbology.layers.forEach((d, i) => {
                        newSymbology.layers[i].layout.visibility = curTopSymb.isVisible ? 'visible' :  "none";
                      });
                      draft.symbologies[topSymbKey].symbology.layers[lKey] = newSymbology;
                    }
                  });
            })
        });
    }, [interactiveFilterIndicies])

    const heightStyle = HEIGHT_OPTIONS[state.height];
    const legendPositionStyle = PANEL_POSITION_OPTIONS[state.legendPosition];
    const pluginPositionStyle = PANEL_POSITION_OPTIONS[state.pluginControlPosition];
    const activeFilter = activeLayer?.selectedInteractiveFilterIndex;
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }

    useEffect(() => {
        if (!isEdit || !onChange) return;
        // Persist the base legend, never the transient filtered legend the
        // runtime refresh writes into state. Comparing/saving the sanitized copy
        // keeps this stable — a pure runtime-legend change strips back to the
        // base, so it won't trigger a spurious save or bake a filtered legend
        // into the saved symbology.
        const persistState = stripRuntimeLegendState(state);
        if (!isEqual(value, persistState)) {
            onChange(persistState)
        }
    }, [onChange, value, state, isEdit]);

//     useEffect(() => {
// console.log("CALLING ON CHANGE", state);
//         onChange && onChange(state);
//     },[onChange, state]);

    defaultStyles.sort((a,b) => {
        if(a.name === state.basemapStyle) {
            return -1;
        } else if (b.name === state.basemapStyle) {
            return 1
        } else {
            return 0
        }
    })

    return (
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv, doApiLoad}}>
            {/* {
                isEdit ? (
                    <>
                        <SymbologySelector context={MapContext}/>
                        <FilterControls />
                        <MoreControls />
                    </>
                ) : null
            } */}
            <div id='dama_map_edit' className={damaMapT.container} style={{height: heightStyle}}>
                <AvlMap
                  // AvlMap reads mapOptions.styles only once at mount (into a ref),
                  // so toggling blankBaseMap can't swap the live style in place.
                  // Key the map on the blank/default choice so the toggle remounts
                  // it with the correct basemap. (Basemap-selector changes still go
                  // through the in-place setMapStyle path and don't remount.)
                  key={ state.blankBaseMap ? "basemap-blank" : "basemap-default" }
                  layers={ mapLayers }
                  layerProps = { layerProps }
                  hideLoading={true}
                  showLayerSelect={true}
                  mapOptions={{
                    center: center,
                    zoom: zoom,
                    //protocols: [PMTilesProtocol],
                    styles: state.blankBaseMap ? blankStyles : defaultStyles,
                      dragPan: state.zoomPan,
                      scrollZoom: state.zoomPan,
                      dragRotate: state.zoomPan
                  }}
                  onMapStyleSelect={(selectedStyle) => {
                      setState(draft => {
                        draft.basemapStyle = selectedStyle.name;
                      })
                  }}
                  leftSidebar={ false }
                  rightSidebar={ false }
                />
                {state.display?.layerPanel === 'library' && !state.hideControls ? (
                    <div className={damaMapT.layerLibraryWrapper}>
                        <LayerLibraryPanel />
                    </div>
                ) : null}
                <div className={`absolute ${legendPositionStyle} ${damaMapT.legendWrapper}`}>
                    <div className={isHorizontalLegendActive ? damaMapT.legendInnerHorizontal : damaMapT.legendInner}><LegendPanel position={state.legendPosition}/></div>
                </div>
                <div className={`absolute ${pluginPositionStyle} ${damaMapT.pluginWrapper}`}>
                    {arePluginsLoaded && <ExternalPluginPanel />}
                </div>
            </div>
        </MapContext.Provider>
    )
}

MapSection.settings = {
    hasControls: false,
    name: 'ElementEdit'
}
