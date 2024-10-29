const applyFn = (col, fn={}, groupBy=[]) => {
    const colName = col.name;
    const mustHaveFnCondition = (col.type !== 'calculated' || col.display !== 'calculated') && // should not be a calculated col
                                !groupBy.includes(col.name) // should not be grouped by

    const functions = {
        [undefined]: `data->>'${colName}' as ${colName}`,
        list: `array_to_string(array_agg(distinct data->>'${colName}'), ', ') as ${colName}`,
        sum: `sum(data->>'${colName}') as ${colName}`,
        count: `count(data->>'${colName}') as ${colName}`,
    }

    if(mustHaveFnCondition && !fn[colName]) return null;
    return functions[fn[colName]]
}
// test
// action number : count
// funding allocated: sum

const removeFn = (colName) => {
    const patterns = [
        /^data->>'([^']+)' as ([^\s]+)$/,
        /^array_to_string\(array_agg\(distinct data->>'([^']+)'\), ', '\) as ([^\s]+)$/,
        /^sum\(data->>'([^']+)'\) as ([^\s]+)$/,
        /^count\(data->>'([^']+)'\) as ([^\s]+)$/
    ];

    return patterns.find(pattern => pattern.exec(colName))?.exec(colName)[1] || colName;
}

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const getNestedValue = value =>
    value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) :
        !value?.value && typeof value?.value === 'object' ? '' : value;

export const formattedAttributeStr = col => `data->>'${col}' as ${col}`;
export const attributeAccessorStr = col => `data->>'${col}'`;

const formatFilters = filters => filters.filter(f => f.values?.length && f.values.filter(fv => fv.length).length).reduce((acc, f) => ({...acc, [attributeAccessorStr(f.column)]: f.values}), {});

const parseIfJson = value => {
    try{
        return JSON.parse(value)
    }catch (e) {
        return value
    }
}
const getColAccessor = (col, groupBy, fn) => {
    const isGrouping = groupBy.length;

    return col.type === 'calculated' && !isGrouping ?
        null : // calculated columns in non-grouped mode are not allowed. todo: remove them from columns dropdown and from visibleAttributes on groupBy select
        col.type === 'calculated' || !isGrouping ?
            col.name : // calculated columns don't need accessors. if you're not grouping, you use list api call. it takes care of accessors.
            applyFn(col, fn, groupBy) // in a grouped mode, all columns except grouped and calculated columns need fn
}

const cleanColName = (colName, isGrouping) => {

    return !isGrouping ? colName : removeFn(colName)
}

const cleanValue = value => typeof value === "object" && value?.value ? cleanValue(value.value) :
    typeof value === "object" && !value?.value ? undefined : parseIfJson(value);

const getFullCol = (colName, attributes) => attributes.find(attr => attr.name === colName)

export const getData = async ({format, apiLoad, currentPage, pageSize, length, visibleAttributes, orderBy, filters, groupBy, fn}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    // if grouping, use load. disable editing.
    const originalAttributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const attributesToFetch = visibleAttributes.map(col => getColAccessor(getFullCol(col, originalAttributes), groupBy, fn)).filter(c => c) //JSON.parse(format?.config || '{}')?.attributes || [];
    const fromIndex = currentPage*pageSize;
    const toIndex = Math.min(length-1, currentPage*pageSize + pageSize);
    if(fromIndex > length - 1) return [];

    console.log('fetching', fromIndex, toIndex, attributesToFetch)
    const children = [{
        type: () => {
        },
        action: groupBy.length ? 'load' : 'list',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                orderBy: Object.keys(orderBy).reduce((acc, curr) => ({...acc, [`data->>'${curr}'`]: orderBy[curr]}) , {}),
                filter: formatFilters(filters),
                ...groupBy.length && {groupBy: groupBy.map(col => `data->>'${col}'`)}
            }),
            attributes: attributesToFetch,
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.doc_type, //doc_type when format is not passed, but the user selects it in pageEdit.
        format: {...format, type: format.doc_type},
        attributes: attributesToFetch,
        children
    });

    console.log('data', visibleAttributes, fn, data)
    // todo: known bug, and possible solution
    // after changing fn for a column multiple times, all previously selected fns are also included in data.
    // this makes it so that sometimes wrong fn is displayed.
    // find a way to tell which key to use from data.
    // using visible attributes and fn, maybe filter out Object.keys(row)
    const d = groupBy.length ? data.map(row => Object.keys(row).reduce((acc, column) => ({...acc, [cleanColName(column, groupBy.length)]: cleanValue(row[column])}) , {})) :
        data;
    console.log('d?', d)
    return d;

}

export const getLength = async ({format, apiLoad, filters=[], groupBy=[]}) =>{
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'filteredLength',
        path: '/',
        filter: {
            options: JSON.stringify({
                aggregatedLen: groupBy.length,
                filter: formatFilters(filters),
                ...groupBy.length && {groupBy: groupBy.map(col => `data->>'${col}'`)}
            })
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.doc_type, //doc_type when format is not passed, but the user selects it in pageEdit.
        format: {...format, type: format.doc_type},
        attributes,
        children
    });
    console.log('length', length)
    return length;
}

export const convertToUrlParams = (arr, delimiter) => {
    const params = new URLSearchParams();

    arr.forEach(item => {
        const { column, values = [] } = item;
        params.append(column, values.filter(v => v.length).join(delimiter));
    });

    return params.toString();
};