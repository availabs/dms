/**
 * useComparisonSeriesLayers — the Map section's `comparison_series` subscriber runtime.
 *
 * The graph sections bind to a published route/series list through a
 * `comparison_series` entry in `display._functions.subscribers` (see
 * `dataWrapper/usePageFilterSync.js`); a publisher like ReportRouteList discovers
 * subscriber-carrying sections (`findSelfBoundGraphs` — element-type-agnostic) and
 * publishes `{label, filters}` entries per assigned route comp to the section's
 * action param. This hook is the Map-side counterpart: instead of fanning out a
 * query per variant, it materializes ONE SYMBOLOGY LAYER per variant from a layer
 * the author flagged `'series-template': true`.
 *
 * Per variant the materialized layer gets:
 *  - a geometry-side static `filter` on the template's `series-feature-column`
 *    (default: the join's `featureKeyColumn`) from the matching leaf of the
 *    variant's filter tree — this scopes the tiles AND, via
 *    collectActiveJoinFilterGroups, the tile-join subquery;
 *  - when the template has an enabled join: the WHOLE variant filter tree as the
 *    join subquery's filterGroups (arm-equivalent pre-aggregation scoping);
 *  - the variant label as its name, a series-palette line color (only when the
 *    template has no `data-column` — choropleth templates keep their own paint),
 *    and a matching one-row `legend-data`.
 *
 * Generated layers are RUNTIME-ONLY: they carry `__seriesGenerated: true` and are
 * stripped before persistence (see stripRuntimeLegendState in map/index.jsx),
 * same pattern as the runtime legend refresh. The template layer itself is never
 * mutated — emitters keep it hidden (`layout.visibility: 'none'`).
 *
 * This deliberately does NOT touch the map's page-filter sync (which drops
 * `type:'action'` filters to avoid hover/click publish thrash) — the hook reads
 * only its own named action param, resolved with the same `$self` sentinel
 * semantics as usePageFilterSync so publisher discovery and this runtime can
 * never disagree on the key.
 */

import { useEffect, useContext } from "react";
import mapboxgl from "maplibre-gl";
import { PageContext, CMSContext } from "../../../../../context.js";
import {
    resolveComparisonVariants,
    SELF_PARAM_KEY_SENTINEL,
    selfParamKey,
} from "../../dataWrapper/buildUdaConfig";
import { fetchBoundsForFilter } from "../../../../../../mapeditor/MapEditor/stateUtils";
import { getColorRange } from "../../../../../../../ui/components/graph/colorRange";

export const SERIES_TEMPLATE_KEY = "series-template";
export const SERIES_GENERATED_KEY = "__seriesGenerated";
export const SERIES_FINGERPRINT_KEY = "__seriesKey";

const SERIES_ID_SEPARATOR = "__series_";
export const seriesLayerId = (templateLayerId, index) =>
    `${templateLayerId}${SERIES_ID_SEPARATOR}${index}`;
export const isSeriesGeneratedLayer = (layer) =>
    Boolean(layer?.[SERIES_GENERATED_KEY]) ||
    String(layer?.id || "").includes(SERIES_ID_SEPARATOR);

/** Collect every `{col, op, value}` leaf of a variant filter tree. */
const collectFilterLeaves = (node, out = []) => {
    if (!node || typeof node !== "object") return out;
    if (Array.isArray(node.groups)) {
        node.groups.forEach((child) => collectFilterLeaves(child, out));
        return out;
    }
    if (node.col) out.push(node);
    return out;
};

const getTemplateFeatureColumn = (template) =>
    template?.["series-feature-column"] ||
    template?.join?.featureKeyColumn ||
    null;

/**
 * Build one concrete layer from the template for a resolved variant. Pure —
 * exported for tests.
 */
export const materializeSeriesLayer = (template, variant, index, color) => {
    const newId = seriesLayerId(template.id, index);
    const layer = JSON.parse(JSON.stringify(template));

    delete layer[SERIES_TEMPLATE_KEY];
    delete layer["series-fit-bounds"];
    // The template layer typically suppresses its own legend row
    // (`legend-orientation: "none"` — it renders nothing itself); materialized
    // layers are the real, viewer-facing series and always get their row.
    delete layer["legend-orientation"];
    layer[SERIES_GENERATED_KEY] = true;
    layer.id = newId;
    layer.name = variant.label || `Series ${index + 1}`;
    layer.isVisible = true;

    // Re-suffix sub-layer ids AND per-layer source ids — the stack's
    // convention is one vector source per logical layer ({tileSourceId}_{lid},
    // see LayerManager/utils.jsx getLayer), and the layer lifecycle assumes it
    // owns its sources. Duplicate tile downloads dedupe in the HTTP cache
    // (tiles are served with Cache-Control max-age).
    layer.sources = (template.sources || []).map((entry) => ({
        ...entry,
        id: String(entry.id || "").replace(template.id, newId),
    }));
    layer.layers = (template.layers || []).map((subLayer) => ({
        ...subLayer,
        id: String(subLayer.id || "").replace(template.id, newId),
        source: String(subLayer.source || "").replace(template.id, newId),
        layout: { ...(subLayer.layout || {}), visibility: "visible" },
    }));

    // Geometry-side scoping: the variant leaf on the feature column becomes the
    // layer's static filter (tile request + join-subquery pushdown both read it).
    const featureCol = getTemplateFeatureColumn(template);
    const leaves = collectFilterLeaves(variant.filters);
    const featureLeaf = featureCol
        ? leaves.find((leaf) => leaf.col === featureCol && Array.isArray(leaf.value))
        : null;
    if (featureLeaf) {
        layer.filter = {
            ...(template.filter || {}),
            [featureCol]: { operator: "==", value: featureLeaf.value },
        };
    }

    // Join-side scoping: the whole variant tree filters the join subquery
    // BEFORE aggregation — the tile-join equivalent of a comparisonSeries arm.
    if (layer.join?.enabled) {
        layer.join.query = {
            ...(layer.join.query || {}),
            filterRows: [],
            filters: { filterGroups: variant.filters },
        };
    }

    // Series-palette color + single-swatch legend — only for plain (non-data-
    // driven) templates. Choropleth templates keep their paint/legend; the
    // runtime legend refresh owns those.
    if (!template["data-column"] && color) {
        const mainIndex = layer.layers.length > 1 ? 1 : 0;
        const mainLayer = layer.layers[mainIndex];
        if (mainLayer?.type === "line") {
            mainLayer.paint = { ...(mainLayer.paint || {}), "line-color": color };
        } else if (mainLayer?.type === "fill") {
            mainLayer.paint = { ...(mainLayer.paint || {}), "fill-color": color };
        } else if (mainLayer?.type === "circle") {
            mainLayer.paint = { ...(mainLayer.paint || {}), "circle-color": color };
        }
        layer["legend-data"] = [{ color, label: layer.name }];
    }

    return layer;
};

export function useComparisonSeriesLayers({ state, setState, sectionId, trackingId }) {
    const { pageState } = useContext(PageContext) || {};
    const { falcor, pgEnv } = useContext(CMSContext) || {};

    useEffect(() => {
        const subscriber = (state?.display?._functions?.subscribers || []).find(
            (s) => s?.functionId === "comparison_series" && s?.enabled
        );

        const symbologyEntries = Object.entries(state?.symbologies || {});
        const templatesBySym = symbologyEntries
            .map(([symId, entry]) => {
                const layers = entry?.symbology?.layers || {};
                const templates = Object.values(layers).filter(
                    (layer) => layer?.[SERIES_TEMPLATE_KEY]
                );
                return templates.length ? { symId, templates } : null;
            })
            .filter(Boolean);

        // Subscriber disabled/absent, or nothing to drive: tear down any
        // previously generated layers and stop.
        const hasGenerated = symbologyEntries.some(([, entry]) =>
            Object.values(entry?.symbology?.layers || {}).some(isSeriesGeneratedLayer)
        );
        if (!subscriber || !templatesBySym.length) {
            if (hasGenerated) {
                setState((draft) => {
                    Object.values(draft.symbologies || {}).forEach((entry) => {
                        const layers = entry?.symbology?.layers;
                        if (!layers) return;
                        Object.keys(layers)
                            .filter((id) => isSeriesGeneratedLayer(layers[id]))
                            .forEach((id) => delete layers[id]);
                        delete entry.symbology[SERIES_FINGERPRINT_KEY];
                    });
                });
            }
            return;
        }

        // Same key resolution as usePageFilterSync — trackingId first (stable
        // across publish), section row id as the legacy fallback.
        const effectiveParamKey =
            subscriber.paramKey === SELF_PARAM_KEY_SENTINEL
                ? selfParamKey(trackingId || sectionId)
                : subscriber.paramKey;
        if (!effectiveParamKey) return;

        const published = (pageState?.filters || []).find(
            (filter) => filter.searchKey === effectiveParamKey
        )?.values;

        const args = { labelKey: "label", valueKey: "filters", ...(subscriber.args || {}) };
        const variants = resolveComparisonVariants(args, published);

        const palette = getColorRange(
            Math.min(Math.max(variants.length, 1), 20),
            "div7"
        );

        templatesBySym.forEach(({ symId, templates }) => {
            const fingerprint = JSON.stringify({ variants, templates });
            const entry = state.symbologies[symId];
            if (entry?.symbology?.[SERIES_FINGERPRINT_KEY] === fingerprint) return;

            const generated = templates.flatMap((template) =>
                variants.map((variant, i) =>
                    materializeSeriesLayer(
                        template,
                        variant,
                        i,
                        palette.length ? palette[i % palette.length] : undefined
                    )
                )
            );

            setState((draft) => {
                const draftEntry = draft.symbologies?.[symId];
                const layers = draftEntry?.symbology?.layers;
                if (!layers) return;
                Object.keys(layers)
                    .filter((id) => isSeriesGeneratedLayer(layers[id]))
                    .forEach((id) => delete layers[id]);
                generated.forEach((layer) => {
                    layers[layer.id] = layer;
                });
                draftEntry.symbology[SERIES_FINGERPRINT_KEY] = fingerprint;
            });

            // Fit the map to the union of the variants' feature values (opt-out
            // via `series-fit-bounds: false` on the template). Mirrors the
            // dynamic-filter zoom effect in map/index.jsx.
            const template = templates.find((t) => t["series-fit-bounds"] !== false);
            const featureCol = template && getTemplateFeatureColumn(template);
            if (!template || !featureCol || !variants.length || !falcor) return;
            const union = Array.from(
                new Set(
                    variants.flatMap((variant) =>
                        collectFilterLeaves(variant.filters)
                            .filter((leaf) => leaf.col === featureCol && Array.isArray(leaf.value))
                            .flatMap((leaf) => leaf.value)
                    )
                )
            );
            if (!union.length) return;

            const boundsProbeEntry = {
                ...entry,
                symbology: {
                    ...entry.symbology,
                    activeLayer: template.id,
                    layers: {
                        [template.id]: {
                            ...template,
                            filter: { [featureCol]: { operator: "==", value: union } },
                        },
                    },
                },
            };
            fetchBoundsForFilter(boundsProbeEntry, falcor, pgEnv, [])
                .then((newExtent) => {
                    if (!newExtent) return;
                    setState((draft) => {
                        let parsedExtent;
                        try {
                            parsedExtent =
                                typeof newExtent === "string" ? JSON.parse(newExtent) : newExtent;
                        } catch (e) {
                            console.warn("[Map] Invalid series bounds extent:", newExtent);
                            return;
                        }
                        const coordinates = parsedExtent?.coordinates?.[0];
                        if (!coordinates?.length) return;
                        const mapGeom = coordinates.reduce(
                            (bounds, coord) => bounds.extend(coord),
                            new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
                        );
                        if (mapGeom && draft.symbologies?.[symId]?.symbology) {
                            draft.symbologies[symId].symbology.zoomToFilterBounds = [
                                mapGeom["_sw"],
                                mapGeom["_ne"],
                            ];
                        }
                    });
                })
                .catch((e) => console.warn("[Map] series bounds fetch failed:", e));
        });
    }, [
        pageState?.filters,
        state?.display?._functions,
        state?.symbologies,
        sectionId,
        trackingId,
        setState,
        falcor,
        pgEnv,
    ]);
}
