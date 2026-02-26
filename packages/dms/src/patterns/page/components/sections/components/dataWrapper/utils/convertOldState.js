const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const convertOldState = (state, initialState, compName) => {
    const oldState = isJson(state) ? JSON.parse(state) : {};

    if (compName === 'Rich Text' || compName === 'Filter') {
        return Object.keys(oldState).length ? oldState : initialState;
    }
    if (oldState?.symbologies) return oldState; // map

    // handle filter structure change
    const oldFilters = oldState?.dataRequest && (oldState.columns || [])
        .filter(c => Array.isArray(c.internalFilter) || Array.isArray(c.externalFilter) || Array.isArray(c.internalExclude))
        .map(c => c.name);
    if(oldFilters?.length) {
        // should be safe to deprecate
        oldState.columns = oldState.columns.map(column => ({
            ...column,
            internalFilter: undefined,
            externalFilter: undefined,
            ...oldFilters.includes(column.name) && {
                filters: [
                    Array.isArray(column.internalFilter) ? {type: 'internal', operation: 'filter', values: column.internalFilter, usePageFilters: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                    Array.isArray(column.externalFilter) ? {type: 'external', operation: 'filter', values: column.externalFilter, usePageFilters: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                    Array.isArray(column.internalExclude) ? {type: 'internal', operation: 'exclude', values: column.internalExclude, usePageFilters: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                ].filter(f => f)
            }
        }))
        // if using page filters, or if editing data is allowed, don't cache data.
        if(oldState?.display?.allowEditInView || oldState.columns.find(c => Array.isArray(c.filters) && c.filters?.find(f => f.usePageFilters || f.allowSearchParams))) oldState.data = [];
        return oldState;
    }
    if(oldState?.dataRequest) {
        const existingFilterGroups = oldState.dataRequest?.filterGroups;
        const hasExistingFilterGroups = existingFilterGroups?.groups?.length > 0;

        // Convert all column-based filters (including duplicates) to filterGroups conditions.
        const convertedConditions = [];

        oldState.columns = oldState.columns.map(column => {
            // Only process filters with actual data (skip empty objects from previous bad conversions)
            const realFilters = (column.filters || []).filter(f => f.operation);
            if (!realFilters.length) {
                // Clean up leftover empty filter objects
                if (column.filters?.length) column.filters = undefined;
                return column;
            }

            realFilters.forEach(f => {
                const isScalar = ['gt', 'gte', 'lt', 'lte', 'like'].includes(f.operation);
                const condition = {
                    op: f.operation,
                    col: column.name,
                    value: isScalar
                        ? (Array.isArray(f.values) ? f.values[0] : f.values)
                        : (f.values || []),
                };
                if (f.type === 'external') condition.isExternal = true;
                if (f.usePageFilters || f.allowSearchParams) condition.usePageFilters = true;
                if (f.searchParamKey) condition.searchParamKey = f.searchParamKey;
                if (f.isMulti) condition.isMulti = true;
                if (f.fn) condition.fn = f.fn;
                if (f.display) condition.display = f.display;

                convertedConditions.push(condition);
            });

            // Clear filters from column after migration
            column.filters = undefined;
            return column;
        });

        // Assign converted filters to filterGroups (only if no existing filterGroups)
        if (convertedConditions.length && !hasExistingFilterGroups) {
            oldState.dataRequest.filterGroups = {
                op: oldState.display?.filterRelation || 'AND',
                groups: convertedConditions
            };
        }

        if(![true, false].includes(oldState?.display?.preventDuplicateFetch)) {
            oldState.display.preventDuplicateFetch = true;
        }
        return oldState;
    }

    if(!Array.isArray(oldState?.attributes)) {
        return initialState
    }

    // old component structure. should be deprecated by now.

    const columns = (oldState.attributes || []).map(column => ({
        ...column,
        show: (oldState.visibleAttributes || []).includes(column.name),
        group: (oldState.groupBy || []).includes(column.name),
        sort: oldState.orderBy?.[column.name],
        size: oldState.colSizes?.[column.name],
        customName: oldState.customColNames?.[column.name],
        fn: oldState.fn?.[column.name],
        excludeNA: (oldState.notNull || []).includes(column.name),
        justify: oldState.colJustify?.[column.name],
        formatFn: oldState.formatFn?.[column.name],
        fontSize: oldState.fontSize?.[column.name],
        openOut: (oldState.openOutCols || []).includes(column.name),
        hideHeader: (oldState.hideHeader || []).includes(column.name),
        cardSpan: oldState.cardSpan?.[column.name],
    })).filter(({show, group}) => show || group);
    const display = {
        pageSize: oldState.pageSize,
        usePageFilters: oldState.usePageFilters || oldState.allowSearchParams,
        loadMoreId: oldState.loadMoreId,
        showTotal: oldState.showTotal,
        striped: oldState.striped,
        usePagination: oldState.usePagination,
        allowEditInView: oldState.allowEditInView,
        allowDownload: oldState.allowDownload,
    }
    const sourceInfo = {
        app: oldState.format?.app,
        type: oldState.format?.type,
        isDms: oldState.format?.isDms,
        env: oldState.format?.env,
        srcEnv: oldState.format?.srcEnv,
        source_id: oldState.format?.id,
        view_id: typeof oldState.format?.view_id === "object" ? oldState.format?.view_id?.id : oldState.format?.view_id,
        view_name: oldState.format?.version || oldState.format?.name,
        updated_at: oldState.format?._modified_timestamp || oldState.format?.updated_at,
        columns: oldState.format?.metadata?.columns || JSON.parse(oldState?.format?.config || '{}')?.attributes || [],
    }

    // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
    const filterOptions = columns.reduce((acc, column) => {
        (column.filters || []).forEach(({type, operation, values}) => {
            acc[operation] = {...acc[operation] || {}, [column.name]: values};
        })

        if(column.excludeNA){
            acc.exclude = acc.exclude && acc.exclude[column.name] ?
                {...acc.exclude, [column.name]: [...acc.exclude[column.name], 'null']} :
                {...acc.exclude || [], [column.name]: ['null']}

        }
        return acc;
    }, {})
    const dataRequest = {
        ...filterOptions,
        groupBy: columns.filter(column => column.group).map(column => column.name),
        orderBy: columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}),
        fn: columns.filter(column => column.fn).reduce((acc, column) => ({...acc, [column.name]: column.fn}), {}),
        meta: columns.filter(column => column.show &&
            ['meta-variable', 'geoid-variable', 'meta'].includes(column.display) &&
            column.meta_lookup)
            .reduce((acc, column) => ({...acc, [column.name]: column.meta_lookup}), {})
    }
    console.log('old component structure. should be deprecated by now.')
    return {columns, display, sourceInfo, dataRequest, data: oldState.data || []};
}