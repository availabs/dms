import {getFilters} from "../../shared/filters/utils";
import {isJson} from "./utils";

export const convertOldState = (state, initialState) => {
    const oldState = isJson(state) ? JSON.parse(state) : {};
    if(oldState?.dataRequest) return oldState; // return already valid state.

    if(!Array.isArray(oldState?.attributes)) {
        console.log('oldState', oldState);
        return initialState
    };

    const columns = (oldState.attributes || []).map(column => ({
        ...column,
        show: (oldState.visibleAttributes || []).includes(column.name),
        group: (oldState.groupBy || []).includes(column.name),
        sort: oldState.orderBy?.[column.name],
        externalFilter: (oldState.filters || []).find(f => f.column === column.name)?.values,
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
        isDms: oldState.format?.isDms,
        env: oldState.format?.env,
        srcEnv: oldState.format?.srcEnv,
        source_id: oldState.format?.id,
        view_id: oldState.format?.view_id,
        view_name: oldState.format?.version || oldState.format?.name,
        updated_at: oldState.format?._modified_timestamp || oldState.format?.updated_at,
        columns: oldState.format?.metadata?.columns || JSON.parse(oldState?.format?.config || '{}')?.attributes || [],
    }
    const dataRequest = {
        groupBy: columns.filter(column => column.group).map(column => column.name),
        orderBy: columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}),
        filter: getFilters(columns), // {colName: []}
        fn: columns.filter(column => column.fn).reduce((acc, column) => ({...acc, [column.name]: column.fn}), {}),
        exclude: columns.filter(column => column.excludeNA).reduce((acc, column) => ({...acc, [column.name]: ['null']}), {}),
        meta: columns.filter(column => column.show &&
            ['meta-variable', 'geoid-variable', 'meta'].includes(column.display) &&
            column.meta_lookup)
            .reduce((acc, column) => ({...acc, [column.name]: column.meta_lookup}), {})
    }
    return {columns, display, sourceInfo, dataRequest, data: oldState.data || []};
}