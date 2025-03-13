import {getFilters} from "../../ComponentRegistry/shared/filters/utils";
import {isJson} from "./utils";

export const convertOldState = (state, initialState) => {
    const oldState = isJson(state) ? JSON.parse(state) : {};

    // handle filter structure change
    const oldFilters = oldState?.dataRequest && (oldState.columns || [])
        .filter(c => Array.isArray(c.internalFilter) || Array.isArray(c.externalFilter) || Array.isArray(c.internalExclude))
        .map(c => c.name);
    if(oldFilters?.length) {
        oldState.columns = oldState.columns.map(column => ({
            ...column,
            internalFilter: undefined,
            externalFilter: undefined,
            ...oldFilters.includes(column.name) && {
                filters: [
                    Array.isArray(column.internalFilter) ? {type: 'internal', operation: 'filter', values: column.internalFilter, allowSearchParams: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                    Array.isArray(column.externalFilter) ? {type: 'external', operation: 'filter', values: column.externalFilter, allowSearchParams: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                    Array.isArray(column.internalExclude) ? {type: 'internal', operation: 'exclude', values: column.internalExclude, allowSearchParams: oldState.display?.allowSearchParams, searchParamKey: column.name} : null,
                ].filter(f => f)
            }
        }))
        if(oldState.columns.find(c => Array.isArray(c.filters) && c.filters?.find(f => f.allowSearchParams))) oldState.data = [];
        return oldState;
    }
    if(oldState?.dataRequest) {
        if(oldState.columns.find(c => Array.isArray(c.filters) && c.filters?.find(f => f.allowSearchParams))) oldState.data = [];
        return oldState; // return already valid state.}
    }

    if(!Array.isArray(oldState?.attributes)) {
        console.log('oldState', oldState);
        return initialState
    };

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
        allowSearchParams: oldState.allowSearchParams,
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
    return {columns, display, sourceInfo, dataRequest, data: oldState.data || []};
}