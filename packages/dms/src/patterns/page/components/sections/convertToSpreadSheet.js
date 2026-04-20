import {uniq} from "lodash-es"

const keyMap = {
    groupBy: 'group',
    notNull: 'excludeNA',
    openOutCols: 'openOut',
    visibleCols: 'show'
}
const filterKeys = [
    // 'data', 'attributionData', 'dataSources', 'dataSource', 'customColName',
    //
    // 'dataSize', 'pageSize', 'extFiltersDefaultOpen', 'showCsvDownload', 'striped',
    // 'showTotal', 'columns', 'groupBy', 'fn', 'notNull', 'openOutCols', 'visibleCols',
    // 'sortBy', 'version', 'formatFn', 'colJustify', 'colSizes',
]

const columnRenameRegex = /\s+as\s+/i;
const splitColNameOnAS = name => name.split(columnRenameRegex); // split on as/AS/aS/As and spaces surrounding it
const findColIdx = (columns, name) => columns.findIndex(column =>
    column.name === name || column.accessor === name || splitColNameOnAS(column.name)[0] === name);
const getFilters = (columns= []) => columns.reduce((acc, column) => {
    const values = uniq(column.filters.find(f => f.operation === 'filter')?.values || []);
    if(values.length) acc[column.name] = values;
    return acc;
}, {});
const changeDisasterNumberMeta = (meta, columnname) => {
    return meta && columnname.toLowerCase().includes('disaster_number') ?
        JSON.stringify({...JSON.parse(meta), view_id: 1723}) :
        meta;
}

export const convert = (elementData) => {
    let convertedState = {columns: [], data: [], display: {usePagination: true, pageSize: 5}, sourceInfo: {columns: [], env: 'hazmit_dama', srcEnv: 'hazmit_dama'}};

    Object.keys(elementData)
        .filter(key => !filterKeys.includes(key))
        .sort((a,b) => a.localeCompare(b))
        .forEach(key => {
            const value = elementData[key];

            if(key === 'columns') {
                convertedState.columns = value.map(v => {
                    // delete v.info;
                    // delete v.desc;
                    // handle internal filters
                    const cenrepFilters =
                        (elementData.additionalVariables || [])
                            .filter(filter => v.name === filter.name || v.accessor === filter.name);
                    const internalFilter = cenrepFilters.filter(({action}) => action === 'include') // old terminology. new: filter.
                        .reduce((acc, {defaultValue}) => Array.isArray(defaultValue) ? [...acc, ...defaultValue] : [...acc, defaultValue], []);

                    const internalExclude = cenrepFilters.filter(({action}) => action === 'exclude')
                        .reduce((acc, {defaultValue}) => Array.isArray(defaultValue) ? [...acc, ...defaultValue] : [...acc, defaultValue], []);

                    const filters = [
                        Array.isArray(internalFilter) && internalFilter.length ? {type: 'internal', operation: 'filter', values: internalFilter} : null,
                        Array.isArray(internalExclude) && internalExclude.length ? {type: 'internal', operation: 'exclude', values: internalExclude} : null,
                    ].filter(f => f);

                    return {
                        ...v,
                        justify: v.align,
                        filters: filters.length ? filters : undefined,
                        meta_lookup: v.meta_lookup ? changeDisasterNumberMeta(v.meta_lookup, v.name) : undefined,
                        ...(v.link || {}),
                        // extFilter,
                    }
                })
                // value.forEach(v => {
                //     delete v.info;
                //     delete v.desc;
                // })
            }
            if(['dataSize', 'pageSize', 'extFiltersDefaultOpen', 'showCsvDownload', 'striped'].includes(key)) convertedState.display[key] = value;
            if(key === 'showTotal') convertedState.display.showTotal = Boolean(value.length);
            if(key === 'extFilterCols') {}
            if(key === 'filters') {}
            if(key === 'filterValue') {}
            if(key === 'linkCols') {
                // maybe the columns already have this info
            }
            if(['groupBy', 'notNull', 'openOutCols', 'visibleCols'].includes(key)) {
                const keyToUpdate = keyMap[key];
                value.forEach(col => {
                    const idx = findColIdx(convertedState.columns, col);
                    if(idx !== -1) {
                        convertedState.columns[idx][keyToUpdate] = true;
                    }else {
                        const idx = findColIdx(convertedState.sourceInfo.columns, col);
                        if(idx !== -1) {
                            convertedState.push({...convertedState.sourceInfo.columns[idx], [keyToUpdate]: true});
                        }else{
                            console.log(`${key} col not found.`, col, JSON.stringify(convertedState.columns, null, 2));
                        }
                    }
                })
            }

            if(key === 'sortBy') {
                Object.keys(value).forEach(col => {
                    const idx = findColIdx(convertedState.columns, col);
                    if(idx !== -1) {
                        convertedState.columns[idx].sort = value[col] === 'asc' ? 'asc nulls last' : value[col] === 'desc' ? 'desc nulls last' : value[col];
                    }
                })
            }
            if(key === 'fn'){
                Object.keys(value).forEach(col => {
                    const idx = findColIdx(convertedState.columns, col);
                    if(idx !== -1) {
                        convertedState.columns[idx].fn =
                            value[col].toString().startsWith('array_to_string(array_agg(distinct') ? 'list' :
                                value[col].toString().startsWith('sum(') ? 'sum' :
                                    value[col].toString().startsWith('count(') ? 'count' : undefined;
                    }else{
                        console.log('fn col not found', col)
                    }
                })
            }
            if(key === 'version') {
                convertedState.sourceInfo.view_id = value
                convertedState.sourceInfo.view_name = elementData?.['attributionData']?.['version'];
                convertedState.sourceInfo.updated_at = elementData?.['attributionData']?.['_modified_timestamp']?.value;
            };
            if(key === 'dataSource') {
                const dataSource = elementData.dataSources.find(ds => ds.source_id === value);
                if(dataSource) {
                    convertedState.sourceInfo = {
                        ...convertedState.sourceInfo,
                        source_id: dataSource.source_id,
                        name: dataSource.name,
                        columns: (dataSource.metadata?.columns || []).map(column => ({
                            ...column,
                            meta_lookup: column.meta_lookup ? changeDisasterNumberMeta(column.meta_lookup, column.name) : undefined
                        }))
                    };
                }else{
                    convertedState.sourceInfo.source_id = value;
                }
            }
            // console.log('key', key)
            // console.log(JSON.stringify(elementData[key], null, 2));
        })

    // // take care of internal filters that aren't included in columns array out of the loop
    const extraFilters = (elementData.additionalVariables || [])
        .filter(({name}) => findColIdx(convertedState.columns, name) === -1);

    extraFilters
        .reduce((acc, {name, action, defaultValue}) => {
            const filterKey = action === 'include' ? 'internalFilter' : 'internalExclude';  // old action terminology. new: filter.
            // collect all related filters togather
            const idx = acc.findIndex(a => a.name === name);
            if(idx !== -1) {
                const accValue = acc[idx][filterKey] || [];
                acc[idx][filterKey] = Array.isArray(defaultValue) ? [...accValue, ...defaultValue] : [...accValue, defaultValue];
                return acc;
            }else{
                acc.push({name, [filterKey]: Array.isArray(defaultValue) ? defaultValue : [defaultValue]});
            }

            return acc;
        }, [])
        .forEach(({name, internalFilter, internalExclude}) => {
            const idx = findColIdx(convertedState.sourceInfo.columns, name);
            const column = convertedState.sourceInfo.columns[idx];
            const bkpColumn = {name}
            const filters = [
                Array.isArray(internalFilter) && internalFilter.length ? {type: 'internal', operation: 'filter', values: internalFilter} : null,
                Array.isArray(internalExclude) && internalExclude.length ? {type: 'internal', operation: 'exclude', values: internalExclude} : null,
            ].filter(f => f);
            convertedState.columns.push({
                ...(column || bkpColumn),
                filters: filters.length ? filters : undefined
            });
        })


    // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
    const filterOptions = convertedState.columns.reduce((acc, column) => {
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
    convertedState.dataRequest = {
        // visibleColumns: convertedState.columns.filter(column => column.show),
        ...filterOptions,
        groupBy: convertedState.columns.filter(column => column.group).map(column => column.name),
        orderBy: convertedState.columns.filter(column => column.sort).reduce((acc, column) => (
            {...acc, [column.name]: (typeof column.sort === 'object' ? Object.values(column.sort)[0] : column.sort).includes('asc') ? 'asc nulls last' : 'desc nulls last'}), {}),
        fn: convertedState.columns.filter(column => column.fn).reduce((acc, column) => ({...acc, [column.name]: column.fn}), {}),
        meta: convertedState.columns.filter(column => column.show &&
            ['meta-variable', 'geoid-variable', 'meta'].includes(column.display) && column.meta_lookup)
            .reduce((acc, column) => ({...acc, [column.name]: changeDisasterNumberMeta(column.meta_lookup, column.name)}), {})
    };
    return convertedState;
}

// convert(1003074)

