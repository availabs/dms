const splitColNameOnAS = name => name.includes(' AS ') ? name.split(' AS ') : name.split(' as ');
export const applyFn = (col={}, fn={}, groupBy=[]) => {
    const colName = col.name;
    // apply fns if: column is not calculated column or
    // if it is calculated, and does not have function in name
    const isCalculatedCol = col.type === 'calculated' || col.display === 'calculated';
    const colNameWithAccessor = isCalculatedCol ? splitColNameOnAS(colName)[0] : `data->>'${colName}'`;
    const colNameAfterAS = isCalculatedCol ? splitColNameOnAS(colName)[1] : colName;

    const mustHaveFnCondition = !isCalculatedCol && // if not a calculated col and
                                !groupBy.includes(col.name) // if not grouped by
    const functions = {
        [undefined]: `${colNameWithAccessor} as ${colNameAfterAS}`,
        list: `array_to_string(array_agg(distinct ${colNameWithAccessor}), ', ') as ${colNameAfterAS}`,
        sum: `sum(${colNameWithAccessor}) as ${colNameAfterAS}`,
        count: `count(${colNameWithAccessor}) as ${colNameAfterAS}`,
    }
    // console.log('applyFn', colName, colNameWithAccessor, mustHaveFnCondition, fn)

    if(mustHaveFnCondition && !fn[colName]) return null;
    return functions[fn[colName]]
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

    return !col || (col.type === 'calculated' && !isGrouping) ?
        null : // calculated columns in non-grouped mode are not allowed. todo: remove them from columns dropdown and from visibleAttributes on groupBy select
        /*col.type === 'calculated' ||*/ !isGrouping ?
            col.name : // calculated columns don't need accessors. if you're not grouping, you use list api call. it takes care of accessors.
            applyFn(col, fn, groupBy) // in a grouped mode, all columns except grouped and calculated columns need fn
}

const cleanValue = value => {

    return typeof value === 'boolean' ? JSON.stringify(value) :
        typeof value === "object" && value?.value ? cleanValue(value.value) :
            typeof value === "object" && !value?.value ? undefined :
                typeof value === 'string' ? value :
                parseIfJson(value);
}

const getFullCol = (colName, attributes) => attributes.find(attr => attr.name === colName)

export const getData = async ({format, apiLoad, currentPage, pageSize, length, visibleAttributes, orderBy, filters, groupBy, fn}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    // if grouping, use load. disable editing.
    const originalAttributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const attributesToFetch = visibleAttributes.map(col => ({
        originalName: col,
        reqName: getColAccessor(getFullCol(col, originalAttributes), groupBy, fn),
        resName: splitColNameOnAS(col)[1] || splitColNameOnAS(col)[0] // regular columns won't have 'as', so [1] will only be available for calculated columns
    }))
    const actionType = groupBy.length ? 'load' : 'list';
    const lengthBasedOnActionType = actionType === 'load' ? length - 1 : length; // this really needs to be fixed in api
    const fromIndex = currentPage*pageSize;
    const toIndex = Math.min(lengthBasedOnActionType, currentPage*pageSize + pageSize);
    if(fromIndex > lengthBasedOnActionType) return [];
    if(groupBy.length && !attributesToFetch.length) return [];
    console.log('fetching', fromIndex, toIndex, attributesToFetch)
    const children = [{
        type: () => {
        },
        action: actionType,
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                aggregatedLen: groupBy.length,
                orderBy: Object.keys(orderBy).reduce((acc, curr) => ({...acc, [`data->>'${curr}'`]: orderBy[curr]}) , {}),
                filter: formatFilters(filters),
                ...groupBy.length && {groupBy: groupBy.map(col => `data->>'${col}'`)}
            }),
            attributes: attributesToFetch.map(a => a.reqName).filter(a => a),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.doc_type, //doc_type when format is not passed, but the user selects it in pageEdit.
        format: {...format, type: format.doc_type},
        attributes: attributesToFetch.map(a => a.reqName).filter(a => a),
        children
    });

    console.log('data', data)
    // todo: known bug, and possible solution
    // after changing fn for a column multiple times, all previously selected fns are also included in data.
    // this makes it so that sometimes wrong fn is displayed.
    // find a way to tell which key to use from data.
    // using visible attributes and fn, maybe filter out Object.keys(row)
    const d = groupBy.length ?
        data.map(row => attributesToFetch.reduce((acc, column) => ({...acc, [column.originalName]: cleanValue(row[column.reqName])}) , {})) :
        data;
    console.log('processed data?', d)
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