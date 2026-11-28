import { isEqual } from "lodash-es";
import { dmsDataLoader } from './index.js'
import { migrateToV2 } from '../patterns/page/components/sections/components/dataWrapper/migrateToV2.js'
import { getData } from '../patterns/page/components/sections/components/dataWrapper/getData'
import { loadFilterOptions, filterOptionsKey, withPageFilterValues } from '../patterns/page/components/sections/components/dataWrapper/components/filters/loadFilterOptions.js'

// Which sections preload, and how, is read off each section's COMPONENT — the registry entry its
// element-type resolves to (the caller passes the registry; api/ doesn't import patterns):
//   preloadData                       opt-in: preload this component's rows before first render
//   fullDataLoad, keepOriginalValues  the getData flags the component itself loads with
//   type                              the stable component id migrateToV2 keys shape migrations on
// No element-type names here (the core never knows types): a legacy alias such as "AVL Graph", or a
// theme component that sets preloadData, works without a library change.
// See planning/tasks/current/preload-section-data-from-registry.md.

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
 * into filter tree conditions.
 */
function resolveFilterMap(pageFilters, patternFilters, searchParams) {
    const merged = mergeFilters(pageFilters, patternFilters)

    const urlFilters = {}
    for (const key of searchParams.keys()) {
        urlFilters[key] = searchParams.get(key)?.split('|||').filter(v => v !== '')
    }

    const resolved = merged.map(filter => {
        if (filter.useSearchParams && urlFilters[filter.searchKey]) {
            return { ...filter, values: urlFilters[filter.searchKey] }
        }
        return filter
    })

    return resolved.reduce((acc, f) => {
        if (f.values?.length) acc[f.searchKey] = f.values
        return acc
    }, {})
}

/**
 * Walk a filter tree and inject page filter values into conditions
 * that have usePageFilters: true.
 */
function injectPageFilters(node, filterMap) {
    if (!node) return
    if (node.groups && Array.isArray(node.groups)) {
        node.groups.forEach(child => injectPageFilters(child, filterMap))
        return
    }
    if (!node.usePageFilters) return
    const key = node.searchParamKey || node.col
    const values = filterMap[key]
    if (!values) return
    node.value = Array.isArray(values) ? values : [values]
}

// ---------------------------------------------------------------------------
// Single-section pre-loading
// ---------------------------------------------------------------------------

/**
 * Pre-load dataWrapper data for a single section outside of React.
 * Called from the React Router loader after sections have been fetched.
 *
 * @param {Object} falcor - Falcor client instance
 * @param {string} elementData - Raw JSON string from section element['element-data']
 * @param {string} elementType - Section element['element-type'] (e.g., 'Spreadsheet'), for logs
 * @param {Object} component - The registry entry the element-type resolves to (its preloadData,
 *        fullDataLoad, keepOriginalValues and type are read)
 * @param {Object|null} pageFilterMap - Optional {searchKey: values[]} map for page filter injection
 * @param {string} [sectionId] - Falcor cache-key discriminator (the section's own id/trackingId) —
 *        prevents sibling sections with matching filter/groupBy from colliding on the same Falcor
 *        path when preloaded concurrently. See falcor-sibling-query-cache-collision.md.
 * @returns {string|null} Updated element-data JSON string with pre-loaded data,
 *          or null if pre-loading was skipped
 */
export async function preloadSectionData(falcor, elementData, elementType, component, pageFilterMap = null, sectionId = null) {
    if (!elementData || !component?.preloadData) return null

    // Parse and migrate state (handles v0/v1/v2 formats). Shape migrations are gated on the
    // component's `type` (graph_new's 'avlGraph', whichever registry key — "Graph" or "AVL Graph" —
    // resolved it), as the dataWrapper passes it. The name is not passed: preload never ran the
    // name-gated migrations, and the dataWrapper still runs them at render.
    const state = migrateToV2(elementData, undefined, undefined, component.type)
    if (!state?.externalSource?.source_id && !state?.externalSource?.isDms) return null

    // Respect the "Always Fetch Data" toggle (display.readyToLoad).
    // When false/absent, the section uses cached data from element-data and only
    // fetches on user interaction. This avoids preloading data that was intentionally
    // cached (e.g., a static dataset that never changes).
    // allowEditInView also implies data should load (need rows to edit).
    const shouldLoad = state.display?.readyToLoad === true
    if (!shouldLoad && !state.display?.allowEditInView) {
        if (import.meta.env.DEV) console.log(`[preload] ${elementType} — skipped (readyToLoad=false)`)
        return null
    }

    // Inject page filter values into the filter tree before fetching
    if (pageFilterMap && Object.keys(pageFilterMap).length && state.filters) {
        injectPageFilters(state.filters, pageFilterMap)
    }

    // Create a minimal apiLoad shim
    const apiLoad = (config, path) => dmsDataLoader(falcor, config, path || '/')

    const fullDataLoad = !!component.fullDataLoad
    const keepOriginalValues = !!component.keepOriginalValues

    try {
        const t0 = import.meta.env.DEV ? performance.now() : 0
        // The option lists of the section's filter controls, read with its rows: the filter UI loads them
        // itself once it mounts otherwise, which is two more requests per control after the page is up.
        // Keyed by the filters they were read for, page variables applied as the filter UI applies them
        // (dataWrapper/components/filters/loadFilterOptions.js). A failure leaves them to the browser.
        const optionColumns = withPageFilterValues(state.columns, pageFilterMap)
        const optionState = optionColumns === state.columns ? state : { ...state, columns: optionColumns }
        const hasFilterControls = (optionState.columns || []).some(c => (c.filters || []).some(f => f.type === 'external'))
        const [{ length, data }, filterOptions] = await Promise.all([
            getData({ state, apiLoad, fullDataLoad, keepOriginalValues, optionsOnly: !!component.optionsOnly, sectionId }),
            hasFilterControls
                ? loadFilterOptions({ state: optionState, apiLoad })
                    .then(options => ({ key: filterOptionsKey(optionState), at: Date.now(), options }))
                    .catch(e => { console.warn(`[preload] ${elementType} filter options: ${e.message}`); return null })
                : null,
        ])
        if (import.meta.env.DEV) {
            const ms = (performance.now() - t0).toFixed(0)
            console.log(`[preload] ${elementType}${sectionId ? ` ${sectionId}` : ''} — ${ms}ms, ${data?.length ?? 0} rows (${length} total)`)
        }

        // Return v2-format state with pre-loaded data embedded.
        // useDataLoader's lastFetchKeyRef is seeded from state.data on mount,
        // so it will see the preloaded data and skip re-fetch.
        return JSON.stringify({
            externalSource: state.externalSource,
            columns: state.columns || [],
            filters: state.filters || { op: 'AND', groups: [] },
            display: {
                ...state.display,
                totalLength: length,
                readyToLoad: true,
                // when these rows were read: a 'force' section skips its first fetch in the browser if they
                // are from this page load (dataWrapper/useDataLoader.js), instead of running the same query again
                preloadedAt: Date.now(),
                ...(filterOptions && { filterOptions }),
            },
            data,
            ...(state.dataSourceId && { dataSourceId: state.dataSourceId }),
            ...(state.join && Object.keys(state.join.sources || {}).length && { join: state.join }),
        })
    } catch (e) {
        console.error('preloadSectionData failed for', elementType, e)
        return null
    }
}

// ---------------------------------------------------------------------------
// Page-level orchestration
// ---------------------------------------------------------------------------

/**
 * How long the page waits for a section's preload. A section still loading after this renders
 * without preloaded rows, exactly as with preload_data off (its saved rows, then its own fetch),
 * and the page doesn't wait for it: one slow query (an aggregate over a multi-million-row view
 * took 20-28 s on MitigateNY's risk profiles) otherwise holds the whole page past the server's
 * 30 s request timeout and the visitor gets an empty response.
 */
export const PRELOAD_BUDGET_MS = 5000;

const OVER_BUDGET = Symbol('over budget');

function withinBudget(promise, ms) {
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(OVER_BUDGET), ms); });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Pre-load sections from a single sections array.
 */
async function preloadSectionsArray(falcor, sections, filterMap, label, components, budgetMs = PRELOAD_BUDGET_MS) {
    if (!Array.isArray(sections) || !sections.length) return null

    const preloadable = sections.filter(
        s => components[s?.element?.['element-type']]?.preloadData
    )
    if (!preloadable.length) return null

    if (import.meta.env.DEV) {
        const types = preloadable.map(s => s.element['element-type'])
        console.log(`[preload] ${label} — ${types.length} section(s): ${types.join(', ')}`)
    }

    const t0 = import.meta.env.DEV ? performance.now() : 0
    const updated = await Promise.all(
        sections.map(async (section) => {
            const elementType = section?.element?.['element-type']
            const elementData = section?.element?.['element-data']
            const component = components[elementType]
            if (!component?.preloadData || !elementData) return section

            const sectionId = section.trackingId || section.id
            const preloaded = await withinBudget(
                preloadSectionData(falcor, elementData, elementType, component, filterMap, sectionId),
                budgetMs,
            )
            if (preloaded === OVER_BUDGET) {
                console.warn(`[preload] ${label}: ${elementType} ${sectionId || ''} over ${budgetMs}ms, left to the section's own fetch`)
                return section
            }
            if (!preloaded) return section

            return {
                ...section,
                element: { ...section.element, 'element-data': preloaded }
            }
        })
    )
    if (import.meta.env.DEV) {
        console.log(`[preload] ${label} sections done in ${(performance.now() - t0).toFixed(0)}ms`)
    }
    return updated
}

/**
 * The page a loader result is for: the row whose url_slug matches, or the
 * site's root page (no parent, index 0) for an empty slug. Only rows that
 * carry sections count.
 */
export function findPageItem(data, slug = '') {
    const hasSections = d => (Array.isArray(d.sections) && d.sections.length) ||
                             (Array.isArray(d.draft_sections) && d.draft_sections.length)
    return slug
        ? (data || []).find(d => d.url_slug === slug && hasSections(d))
        : (data || []).find(d => !d.parent && d.index == 0 && hasSections(d))
}

// A row's last save as milliseconds. The same save reads '2026-11-25 19:11:39.994597+00' from the server's
// route and '2026-11-25T19:11:39.994Z' from sync's local copy; both loaders feed a reload.
const savedAt = (v) => {
    const t = Date.parse(String(v).replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00'))
    return Number.isNaN(t) ? String(v) : t
}

// What a reload compares: the page row and each of its published sections, by id and last save.
const pageStamp = (page) => page && page.id != null && page.updated_at
    ? `${page.id}@${savedAt(page.updated_at)}|${(page.sections || []).map(s => `${s?.id}@${savedAt(s?.updated_at)}`).join(',')}`
    : null

/**
 * For a reload of the page that is on screen (sync's invalidation, an auth change): when the page row and
 * its section rows are the ones `shown` (the loader data on screen) was built from, the fresh `data` with that
 * page swapped for the shown one, so every section keeps the settings and rows it has and nothing re-renders
 * from row-less settings. Null when the page changed, or either side can't be compared: the caller preloads.
 * Never mutates. See planning/tasks/current/page-reload-keeps-sections.md.
 */
export function keepShownPage(data, shown, slug = '') {
    const fresh = findPageItem(data, slug)
    const onScreen = findPageItem(shown, slug)
    const stamp = pageStamp(fresh)
    if (!stamp || !onScreen || stamp !== pageStamp(onScreen)) return null
    return data.map(d => d === fresh ? onScreen : d)
}

/**
 * The page's published sections with each section's settings passed through its registry entry's
 * `trimForView(elementData) → elementData`, for a VIEW route's loader data, which is serialized
 * into the page's HTML. A section type leaves out what it saved for its editor (the dataWrapper
 * sections: their copy of the source's whole column list). The edit route never calls this.
 * Returns `data` itself when nothing changed; never mutates it. See page-hydration-payload.md.
 */
export function trimSectionsForView(data, slug = '', components = {}) {
    const pageItem = findPageItem(data, slug)
    if (!pageItem || !Array.isArray(pageItem.sections)) return data

    let changed = false
    const sections = pageItem.sections.map(section => {
        const element = section?.element
        const trim = components[element?.['element-type']]?.trimForView
        if (typeof trim !== 'function' || !element?.['element-data']) return section
        try {
            const elementData = trim(element['element-data'])
            if (elementData === element['element-data']) return section
            changed = true
            return { ...section, element: { ...element, 'element-data': elementData } }
        } catch (e) {
            console.warn(`[trimForView] ${element['element-type']} ${section.id || ''}: ${e.message}`)
            return section
        }
    })
    if (!changed) return data
    return data.map(d => d === pageItem ? { ...d, sections } : d)
}

/**
 * Every section element-type on a page (published and draft), for
 * preloading the page's code-split section components.
 */
export function pageSectionTypes(pageItem) {
    return [...(pageItem?.sections || []), ...(pageItem?.draft_sections || [])]
        .map(s => s?.element?.['element-type'])
        .filter(Boolean)
}

/**
 * Pre-load dataWrapper data for all eligible sections on a page.
 * Called from the page pattern's preload hook in dmsPageFactory's loader.
 * `components` is the section-component registry ({ [element-type]: entry }, theme registrations
 * included); a section preloads when its entry sets `preloadData`.
 * `opts.drafts`: also preload `draft_sections` — only the editor shows them, so the view route
 * passes false. `opts.budgetMs`: how long to wait for any one section (PRELOAD_BUDGET_MS).
 */
export async function preloadPageSections(falcor, data, requestUrl, patternFilters = [], slug = '', components = {}, opts = {}) {
    const { drafts = true, budgetMs = PRELOAD_BUDGET_MS } = opts
    const pageItem = findPageItem(data, slug)
    if (!pageItem) return data

    const url = new URL(requestUrl)
    const filterMap = resolveFilterMap(pageItem.filters, patternFilters, url.searchParams)

    const label = pageItem.title || 'page'

    const [updatedSections, updatedDraftSections] = await Promise.all([
        preloadSectionsArray(falcor, pageItem.sections, filterMap, label, components, budgetMs),
        drafts ? preloadSectionsArray(falcor, pageItem.draft_sections, filterMap, `${label} (draft)`, components, budgetMs) : null,
    ])

    if (!updatedSections && !updatedDraftSections) return data

    return data.map(d => d === pageItem ? {
        ...d,
        ...(updatedSections && { sections: updatedSections }),
        ...(updatedDraftSections && { draft_sections: updatedDraftSections }),
    } : d)
}
