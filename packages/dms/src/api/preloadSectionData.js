import { isEqual } from "lodash-es";
import { dmsDataLoader } from './index.js'
import { convertOldState } from '../patterns/page/components/sections/components/dataWrapper/utils/convertOldState.js'
import { getData } from '../patterns/page/components/sections/components/dataWrapper/utils/utils.jsx'

// Per-component config needed by getData, keyed by element-type.
// Only types that use dataWrapper and are worth pre-loading.
const COMPONENT_PRELOAD_CONFIG = {
    'Spreadsheet': { fullDataLoad: false, keepOriginalValues: true },
    'Card':        { fullDataLoad: false, keepOriginalValues: true },
    'Graph':       { fullDataLoad: true,  keepOriginalValues: false },
}

const PRELOADABLE_TYPES = new Set(Object.keys(COMPONENT_PRELOAD_CONFIG))

/**
 * Check if a section's element-type supports data pre-loading.
 */
export function isPreloadableType(elementType) {
    return PRELOADABLE_TYPES.has(elementType)
}

// ---------------------------------------------------------------------------
// Page filter resolution helpers
// ---------------------------------------------------------------------------

function parseIfJSON(text, fallback = []) {
    if (text && typeof text === 'object') return text
    if (typeof text !== 'string' || !text) return fallback
    try { return JSON.parse(text) } catch { return fallback }
}

/**
 * Merge page-level and pattern-level filters. Pattern filters override page
 * filters that share the same searchKey.
 * (Mirrors patterns/page/pages/_utils/index.js mergeFilters)
 */
function mergeFilters(pageFilters, patternFilters) {
    const page = parseIfJSON(pageFilters, pageFilters || [])
    const pattern = patternFilters || []
    const pageOnly = (page || []).filter(
        f => !pattern.some(pf => pf.searchKey === f.searchKey)
    )
    return [...pattern, ...pageOnly]
}

/**
 * Resolve effective page filters from page defaults, pattern overrides, and
 * URL search params. Returns a {searchKey: values[]} map ready for injection
 * into filterGroups conditions.
 * (Mirrors the chain: mergeFilters → updatePageStateFiltersOnSearchParamChange)
 */
function resolveFilterMap(pageFilters, patternFilters, searchParams) {
    const merged = mergeFilters(pageFilters, patternFilters)

    // URL params override filters that have useSearchParams: true
    const urlFilters = {}
    for (const key of searchParams.keys()) {
        urlFilters[key] = searchParams.get(key)?.split('|||')
    }

    const resolved = merged.map(filter => {
        if (filter.useSearchParams && urlFilters[filter.searchKey]) {
            return { ...filter, values: urlFilters[filter.searchKey] }
        }
        return filter
    })

    // Convert to {searchKey: values} map
    return resolved.reduce((acc, f) => {
        if (f.values?.length) acc[f.searchKey] = f.values
        return acc
    }, {})
}

/**
 * Walk a filterGroups tree and inject page filter values into conditions
 * that have usePageFilters: true.
 * (Mirrors the useEffect at dataWrapper/index.jsx ~line 620)
 */
function injectPageFilters(node, filterMap) {
    if (!node) return
    // Group node — recurse into children
    if (node.groups && Array.isArray(node.groups)) {
        node.groups.forEach(child => injectPageFilters(child, filterMap))
        return
    }
    // Leaf condition — inject if page-synced
    if (!node.usePageFilters) return
    const key = node.searchParamKey || node.col
    const values = filterMap[key]
    if (!values) return
    node.value = Array.isArray(values) ? values : [values]
}

// ---------------------------------------------------------------------------
// DataRequest enrichment (mirrors dataWrapper/index.jsx effect ~line 674)
// ---------------------------------------------------------------------------

/**
 * Compute the "enriched" dataRequest that the DataWrapper's data request
 * builder effect would produce.  By pre-enriching it here we ensure
 * isEqual(dataRequest, lastDataRequest) holds after the effect runs,
 * preventing a redundant re-fetch.
 */
function enrichDataRequest(state) {
    const columns = state.columns || []

    // Mirror filterOptions useMemo (dataWrapper/index.jsx ~line 638)
    const filterOptions = columns.reduce((acc, column) => {
        const isNormalisedColumn = columns.filter(
            col => col.name === column.name && col.filters?.length
        ).length > 1

        ;(column.filters || [])
            .filter(({ values }) =>
                Array.isArray(values) && values.every(v => typeof v !== 'object') && values.length
            )
            .forEach(({ operation, values, fn }) => {
                if (operation === 'like' && !(values.length && values.every(v => v.length))) {
                    acc[operation] = {}
                } else if (isNormalisedColumn) {
                    ;(acc.normalFilter ??= []).push({ column: column.name, values, operation, fn })
                } else {
                    acc[operation] = { ...acc[operation] || {}, [column.name]: values }
                }
            })

        if (column.excludeNA) {
            acc.exclude = acc.exclude && acc.exclude[column.name]
                ? { ...acc.exclude, [column.name]: [...acc.exclude[column.name], 'null'] }
                : { ...acc.exclude || [], [column.name]: ['null'] }
        }
        return acc
    }, {})

    // Mirror orderBy useMemo
    const orderBy = columns
        .filter(c => c.sort)
        .reduce((acc, c) => ({ ...acc, [c.name]: c.sort }), {})

    // Mirror meta computation
    const meta = columns
        .filter(c => c.show && ['meta-variable', 'geoid-variable', 'meta'].includes(c.display) && c.meta_lookup)
        .reduce((acc, c) => ({ ...acc, [c.name]: c.meta_lookup }), {})

    return {
        ...state.dataRequest || {},
        filter: filterOptions.filter || {},
        exclude: filterOptions.exclude || {},
        gt: filterOptions.gt || {},
        gte: filterOptions.gte || {},
        lt: filterOptions.lt || {},
        lte: filterOptions.lte || {},
        like: filterOptions.like || {},
        filterGroups: state.dataRequest?.filterGroups || {},
        ...filterOptions,
        orderBy,
        meta,
    }
}

// ---------------------------------------------------------------------------
// Single-section pre-loading
// ---------------------------------------------------------------------------

/**
 * Pre-load dataWrapper data for a single section outside of React.
 * Called from the React Router loader after sections have been fetched.
 *
 * @param {Object} falcor - Falcor client instance (same one used by dmsDataLoader)
 * @param {string} elementData - Raw JSON string from section element['element-data']
 * @param {string} elementType - Section element['element-type'] (e.g., 'Spreadsheet')
 * @param {Object|null} pageFilterMap - Optional {searchKey: values[]} map for page filter injection
 * @returns {string|null} Updated element-data JSON string with pre-loaded data,
 *          or null if pre-loading was skipped (not applicable, already fresh, etc.)
 */
export async function preloadSectionData(falcor, elementData, elementType, pageFilterMap = null) {
    if (!elementData || !isPreloadableType(elementType)) return null

    // Parse and migrate state (handles all legacy formats)
    const state = convertOldState(elementData)
    if (!state?.dataRequest || !state?.sourceInfo) return null

    // Inject page filter values into filterGroups before the readyToLoad
    // and freshness checks — this ensures the dataRequest reflects the
    // URL-mapped filter state that the component would compute on mount.
    if (pageFilterMap && Object.keys(pageFilterMap).length && state.dataRequest?.filterGroups) {
        injectPageFilters(state.dataRequest.filterGroups, pageFilterMap)
    }

    // Respect the component's readyToLoad gate — if the section is configured
    // to only load on interaction, don't pre-load it
    if (!state.display?.readyToLoad && !state.display?.allowEditInView) {
        if (import.meta.env.DEV) console.log(`[preload] ${elementType} — skipped (readyToLoad=false)`)
        return null
    }

    // Cache freshness check — if data was previously loaded and the request
    // hasn't changed, the cached data in element-data is still valid
    if (state.display?.preventDuplicateFetch
        && state.lastDataRequest
        && isEqual(state.dataRequest, state.lastDataRequest)
        && state.data?.length) {
        if (import.meta.env.DEV) console.log(`[preload] ${elementType} — skipped (cache fresh)`)
        return null
    }

    // Create a minimal apiLoad shim — same interface as the React wrapper
    // but without the setBusy loading state (not needed outside React)
    const apiLoad = (config, path) => dmsDataLoader(falcor, config, path || '/')

    const { fullDataLoad, keepOriginalValues } = COMPONENT_PRELOAD_CONFIG[elementType]

    try {
        const t0 = import.meta.env.DEV ? performance.now() : 0
        const { length, data } = await getData({ state, apiLoad, fullDataLoad, keepOriginalValues })
        if (import.meta.env.DEV) {
            const ms = (performance.now() - t0).toFixed(0)
            console.log(`[preload] ${elementType} — ${ms}ms, ${data?.length ?? 0} rows (${length} total)`)
        }

        // Pre-enrich dataRequest with the same empty-object keys that the
        // DataWrapper's data request builder effect would add (filter, exclude,
        // gt, gte, lt, lte, like, orderBy, meta). This ensures isEqual(
        // dataRequest, lastDataRequest) holds after the effect runs.
        const enrichedDataReq = enrichDataRequest(state)

        // Return updated state as JSON string — embed pre-loaded data and set
        // lastDataRequest so the component's isEqual check skips re-fetch
        return JSON.stringify({
            ...state,
            data,
            dataRequest: enrichedDataReq,
            lastDataRequest: enrichedDataReq,
            display: {
                ...state.display,
                totalLength: length,
                readyToLoad: true,
                preventDuplicateFetch: state.display?.preventDuplicateFetch ?? true,
            }
        })
    } catch (e) {
        console.error('preloadSectionData failed for', elementType, e)
        return null // component will fall back to its own fetch
    }
}

// ---------------------------------------------------------------------------
// Page-level orchestration — pre-load all dataWrapper sections on a page
// ---------------------------------------------------------------------------

/**
 * Pre-load dataWrapper data for all eligible sections on a page.
 * Called from the page pattern's preload hook in dmsPageFactory's loader.
 *
 * @param {Object} falcor - Falcor client instance
 * @param {Array} data - Page data items from dmsDataLoader
 * @param {string} requestUrl - Full request URL (for extracting search params)
 * @param {Array} patternFilters - Pattern-level filter definitions
 * @param {string} slug - URL slug from route params (params['*'])
 * @returns {Array} Updated data array with pre-loaded section data embedded
 */
export async function preloadPageSections(falcor, data, requestUrl, patternFilters = [], slug = '') {
    // Find the page item that matches the current route's slug.
    // This mirrors how EditWrapper + filterParams resolve the active page:
    //   - If slug is set, match by url_slug
    //   - If root URL (empty slug), use the default page (index 0, no parent)
    const pageItem = slug
        ? data.find(d => d.url_slug === slug && Array.isArray(d.sections) && d.sections.length)
        : data.find(d => !d.parent && d.index == 0 && Array.isArray(d.sections) && d.sections.length)
    if (!pageItem) return data

    // Check if any sections are preloadable before doing URL parsing work
    const preloadable = pageItem.sections.filter(
        s => isPreloadableType(s?.element?.['element-type'])
    )
    if (!preloadable.length) return data

    if (import.meta.env.DEV) {
        const types = preloadable.map(s => s.element['element-type'])
        console.log(`[preload] ${pageItem.title || 'page'} — ${types.length} section(s): ${types.join(', ')}`)
    }

    // Resolve effective page filters: page defaults → pattern overrides → URL params
    const url = new URL(requestUrl)
    const filterMap = resolveFilterMap(pageItem.filters, patternFilters, url.searchParams)

    // Pre-load all preloadable sections in parallel
    const t0 = import.meta.env.DEV ? performance.now() : 0
    const updatedSections = await Promise.all(
        pageItem.sections.map(async (section) => {
            const elementType = section?.element?.['element-type']
            const elementData = section?.element?.['element-data']
            if (!isPreloadableType(elementType) || !elementData) return section

            const preloaded = await preloadSectionData(falcor, elementData, elementType, filterMap)
            if (!preloaded) return section

            return {
                ...section,
                element: { ...section.element, 'element-data': preloaded }
            }
        })
    )
    if (import.meta.env.DEV) {
        console.log(`[preload] all sections done in ${(performance.now() - t0).toFixed(0)}ms`)
    }

    // Return data array with the page item's sections updated
    return data.map(d => d === pageItem ? { ...d, sections: updatedSections } : d)
}
