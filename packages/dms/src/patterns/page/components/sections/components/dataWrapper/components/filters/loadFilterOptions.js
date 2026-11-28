import { uniqBy } from "lodash-es"
import { attributeAccessorStr, isJson } from "../../utils/utils";
import {
    getData,
    parseIfJson,
    getFilters,
    isCalculatedCol,
    formattedAttributeStr,
    getNormalFilters, getData as getFilterData, isSystemCol
} from "./utils"

// The option lists of a section's filter controls, loaded outside React so the page loader can read them
// before the first render (api/preloadSectionData.js) with the code the filter UI itself runs
// (RenderFilters.jsx). See planning/tasks/current/first-fetch-and-preload-gaps.md.

const tracked = (columns) => (columns || []).filter(({ filters }) => filters?.length);

/**
 * What the option lists depend on, as a string: the source, and each filter column's name, filter settings
 * and current values. RenderFilters compares it with the key preloaded options carry (`display.filterOptions`)
 * to tell whether they are the lists it would load now.
 */
export function filterOptionsKey(state, isEdit = false) {
    const src = state?.externalSource || {};
    return JSON.stringify([
        isEdit, src.source_id ?? null, src.view_id ?? null, src.isDms ? src.type ?? null : null,
        tracked(state?.columns).map(c => [
            c.name, c.isDuplicate ? 1 : 0, c.type ?? null, c.optionOrderBy ?? null,
            Array.isArray(c.options) ? c.options.length : 0,
            (c.filters || []).map(f => [f.type ?? null, f.operation ?? null, f.values ?? []]),
        ]),
    ]);
}

/**
 * The page's variable values written into the filters bound to them (`usePageFilters` + `searchParamKey`),
 * as RenderFilters does once the section is on a page. `pageFilters`: { searchKey: values }. Returns
 * `columns` itself when nothing is bound or nothing differs; never mutates.
 */
export function withPageFilterValues(columns, pageFilters) {
    if (!pageFilters || !Object.keys(pageFilters).length) return columns;
    let changed = false;
    const next = (columns || []).map(column => {
        if (!column.filters?.length) return column;
        let touched = false;
        const filters = column.filters.map(filter => {
            if (!filter.usePageFilters) return filter;
            const v = pageFilters[filter.searchParamKey];
            const values = !v ? [] : Array.isArray(v) ? v : [v];
            if (JSON.stringify(filter.values) === JSON.stringify(values)) return filter;
            touched = true;
            return { ...filter, values };
        });
        if (!touched) return column;
        changed = true;
        return { ...column, filters };
    });
    return changed ? next : columns;
}

/**
 * Loads the option list of every filter control the section shows: [{ column, uniqValues: [{label, value}] }].
 * View mode loads external filters only; a range or text filter has no list.
 */
export async function loadFilterOptions({ state, apiLoad, isEdit = false }) {
    const isDms = state.externalSource?.isDms;
    const filterColumns = (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && !isDuplicate);
    const normalFilterColumns = (state.columns || []).filter(({ filters, isDuplicate }) => filters?.length && isDuplicate);
    const filters = getFilters(filterColumns);
    const normalFilters = getNormalFilters(normalFilterColumns);
    const getFormattedAttributeStr = (column) => formattedAttributeStr(column, isDms, isCalculatedCol(column, state.columns));
    const getAttributeAccessorStr = (column) => attributeAccessorStr(column, isDms, isCalculatedCol(column, state.columns), isSystemCol(column, state.columns));

    return Promise.all(
        [...Object.keys(filters), ...normalFilters?.map(f => f.column)]
            // don't pull filter data for internal filters in view mode
            .filter(f => {
                const filter = (state.columns || []).find(({ name }) => name === f)?.filters?.[0];

                if (['gt', 'gte', 'lt', 'lte', 'like'].includes(filter.operation)) return false; // never load numerical data
                if (isEdit) return true;
                if (filter?.type === 'external') return true;
            })
            .map(async columnName => {
                // STATIC options: a column may carry an author-provided `options`
                // [{value,label}] list (e.g. months with no real DB column) — use it
                // directly and skip the DB query. Opt-in; no impact on data-driven filters.
                const staticCol = (state.columns || []).find(c => c.name === columnName);
                if (Array.isArray(staticCol?.options) && staticCol.options.length) {
                    return { column: columnName, uniqValues: staticCol.options.map(o => ({ label: o.label ?? o.value, value: o.value })) };
                }
                // other filter values to filter by

                const filterBy = await Object.keys(filters)
                    .filter(f => f !== columnName)
                    .reduce(async (accPromise, columnName) => {
                        const acc = await accPromise;

                        const filterColumn = (state.columns || []).find(({ name }) => name === columnName);
                        const filter = filterColumn?.filters?.[0];
                        if (!filter?.values?.length) return acc;

                        if (filterColumn.type === 'multiselect') {
                            const reqName = getFormattedAttributeStr(columnName);
                            const options = await getFilterData({
                                reqName,
                                refName: getAttributeAccessorStr(columnName),
                                allAttributes: [filterColumn],
                                apiLoad,
                                format: state.externalSource,
                            });

                            const selectedValues = filter.values
                                .map(o => o?.value || o)
                                .map(o => o === null ? 'null' : o)
                                .filter(o => o);

                            const matchedOptions = options
                                .map(row => {
                                    const option = row[reqName]?.value || row[reqName];
                                    const parsedOption =
                                        isJson(option) && Array.isArray(JSON.parse(option)) ? JSON.parse(option) :
                                            Array.isArray(option) ? option :
                                                typeof option === 'string' ? [option] : [];
                                    return parsedOption.find(o => selectedValues.includes(o)) ? option : null;
                                })
                                .filter(option => option);

                            acc[filter.operation] = {
                                ...(acc[filter.operation] || {}),
                                [getAttributeAccessorStr(columnName)]: matchedOptions
                            };
                        } else {
                            const values = ['gt', 'gte', 'lt', 'lte', 'like'].includes(filter.operation) ? filter.values[0] : filter.values;
                            acc[filter.operation] = {
                                ...(acc[filter.operation] || {}),
                                [getAttributeAccessorStr(columnName)]: values
                            };
                        }

                        return acc;
                    }, Promise.resolve({}));

                // get all the filters with value
                // build a filterOptions object including each filter type (filter, exclude, gt, gte...),
                // for filter and exclude types, and multiselect column combination, pull value sets for
                // optional per-column option ordering by an aggregate (e.g. busiest-first by
                // sum(aadt)); when set, the query orders the options and we keep that order.
                const optionOrderBy = (state.columns || []).find(c => c.name === columnName)?.optionOrderBy;
                let data = await getData({
                    format: state.externalSource,
                    apiLoad,
                    // length,
                    reqName: getFormattedAttributeStr(columnName), // column name with as
                    refName: getAttributeAccessorStr(columnName), // column name without as
                    rawName: columnName, // column name without accessor (response name)
                    allAttributes: state.columns,
                    filterBy,
                    orderBy: optionOrderBy
                })

                // console.log('fo data?', columnName, data)

                // not adding options from meta to allow options to filter down wrt other filter values
                const metaOptions = [] //(state.columns || []).find(({name}) => name === columnName)?.options;
                const formattedAttrStr = getFormattedAttributeStr(columnName);

                const dataOptions = data.reduce((acc, d, i) => {

                    const responseValue = d[formattedAttrStr]?.value || d[formattedAttrStr];

                    const metaValue = parseIfJson(responseValue?.value || responseValue);

                    const originalValue = parseIfJson(responseValue?.originalValue || responseValue);

                    const value = Array.isArray(originalValue)
                        ? originalValue.map((pv, i) => ({ label: metaValue?.[i] || pv, value: pv }))
                        : [{ label: metaValue || originalValue, value: originalValue }];
                    value.forEach(({ label, value }) => { if (label && typeof label !== 'object') acc.push({ label, value }); });
                    return acc;
                }, []);
                const uniq = uniqBy(Array.isArray(metaOptions) ? [...metaOptions, ...dataOptions] : dataOptions, d => d.value);
                return {
                    column: columnName,
                    // optionOrderBy → preserve the query's aggregate order (uniqBy keeps first-seen
                    // order); otherwise the default alphabetical/numeric sort.
                    // numeric:true = NATURAL sort, so numbered labels order by value
                    // ("Region 2" before "Region 10" — plain localeCompare put 10/11
                    // between 1 and 2). Identical to alphabetical for unnumbered labels.
                    uniqValues: optionOrderBy ? uniq : uniq.sort((a, b) =>
                        typeof a?.label === 'string' && typeof b?.label === 'string' ?
                            a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }) :
                            b?.label - a?.label
                    ),
                }
            }));
}
