const fnum = (number, currency = false) => `${currency ? '$ ' : ''} ${isNaN(number) ? 0 : parseInt(number).toLocaleString()}`;
const fnumIndex = (d, fractions = 2, currency = false) => {
        if(isNaN(d)) return 'No Data'
        if(typeof d === 'number' && d < 1) return `${currency ? '$' : ``} ${d?.toFixed(fractions)}`
        if (d >= 1_000_000_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000_000_000).toFixed(fractions)} Q`;
        }else if (d >= 1_000_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000_000).toFixed(fractions)} T`;
        } else if (d >= 1_000_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000_000).toFixed(fractions)} B`;
        } else if (d >= 1_000_000) {
            return `${currency ? '$' : ``} ${(d / 1_000_000).toFixed(fractions)} M`;
        } else if (d >= 1_000) {
            return `${currency ? '$' : ``} ${(d / 1_000).toFixed(fractions)} K`;
        } else {
            return typeof d === "object" ? `` : `${currency ? '$' : ``} ${parseInt(d)}`;
        }
    }
;
function convertToNumeric(value) {
    if (typeof value === 'number' && !isNaN(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value.trim());
        if (!isNaN(num)) {
            return num;
        }
    }

    return null;
}

export const formatFunctions = {
    'abbreviate': (d, isDollar) => fnumIndex(d, 1, isDollar),
    'comma': (d, isDollar) => fnum(d, isDollar)
}
const columnRenameRegex = /\s+as\s+/i;

const splitColNameOnAS = name => name.split(columnRenameRegex); // split on as/AS/aS/As and spaces surrounding it

const getFullCol = (colName, attributes) => attributes.find(attr => attr.name === colName)

const isCalculatedCol = (colName, attributes) => {
    const col = getFullCol(colName, attributes)
    if(!col) console.log('col not defined', colName, attributes)
    return col?.display === 'calculated' || col?.type === 'calculated' || col?.origin === 'calculated-column'
};

export const formattedAttributeStr = (col, isDms, isCalculatedCol) => isCalculatedCol ? col : isDms ? `data->>'${col}' as ${col}` : col;

export const attributeAccessorStr = (col, isDms, isCalculatedCol) => isCalculatedCol ? splitColNameOnAS(col)[0] : isDms ? `data->>'${col}'` : col;

const formatFilters = (filters, isDms, attributes) => {
    const res = filters
        // .filter(f => f.valueSets?.length && f.valueSets.filter(fv => fv.length).length)
        .reduce((acc, f) => {
            const attr = attributeAccessorStr(f.column, isDms, isCalculatedCol(f.column, attributes))
            // console.log('filter????', f.column, attr, f.values?.length > f.valueSets?.length, f.values, (f.values || []).map(v => v?.value || v) )
            return ({
                ...acc, [attr]:
                    (f.values || [])?.length > (f.valueSets || [])?.length ?
                        (f.values || []).map(v => v?.value || v) :
                        f.valueSets
            })
        }, {});
    console.log('formatted filters:', filters, res)
    return res
}

const parseIfJson = value => { try { return JSON.parse(value) } catch (e) { return value } }

const getColAccessor = (col, groupBy, fn, isDms) => !col ? null : applyFn(col, fn, groupBy, isDms);

const cleanValue = value => typeof value === 'boolean' ? JSON.stringify(value) :
                                typeof value === "object" && value?.value ? cleanValue(value.value) :
                                    typeof value === "object" && !value?.value ? undefined :
                                        typeof value === 'string' ? parseIfJson(value) :
                                            parseIfJson(value);


export const getNestedValue = value => value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) : !value?.value && typeof value?.value === 'object' ? '' : value;

export const applyFn = (col={}, fn={}, groupBy=[], isDms=false) => {
    const colName = col.name;
    // don't apply fn if: there exists more than one columns, and at least one of them doesn't have fn.

    // apply fns if: column is not calculated column or it is calculated, and does not have function in name

    // calculated columns should never get data->>
    const isCalculatedCol = col.type === 'calculated' || col.display === 'calculated' || col.origin === 'calculated-column';
    const colNameWithAccessor = attributeAccessorStr(colName, isDms, isCalculatedCol);
    const colNameAfterAS = isCalculatedCol ? splitColNameOnAS(colName)[1] : colName;

    const mustHaveFnCondition = !isCalculatedCol && // if not a calculated col and
                                groupBy.length && !groupBy.includes(col.name) // if not grouped by
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

export const getData = async ({format, apiLoad, currentPage=0, pageSize, length, showTotal, visibleAttributes=[], orderBy={}, filters=[], groupBy=[], fn={}, notNull}) =>{
    const actionType = 'uda';
    const fromIndex = currentPage*pageSize;
    const toIndex = Math.min(length, currentPage*pageSize + pageSize) - 1;
    if(fromIndex > length) return [];
    console.log('what is going on', currentPage, pageSize, length)

    // invalid state: while NOT grouping by, there are some columns with fn applied. either all of them need fn, or none.
    const nonGroupedColumnsLength = visibleAttributes.filter(va => !groupBy.includes(va)).length
    // no column is grouped by, and fns don't equal visible columns (using length but maybe more nuanced matching can be used)
    const noGroupSomeFnCondition = visibleAttributes.length > 1 && !groupBy.length && Object.keys(fn).length > 0 && Object.keys(fn).length !== visibleAttributes.length;
    // grouping by some column(s), but fns don't equal non-grouped columns (using length but maybe more nuanced matching can be used)
    const groupNoFnCondition = groupBy.length && Object.keys(fn).length !== nonGroupedColumnsLength; // while grouping, all the non-grouped columns should have a fn
    const isInvalidState = noGroupSomeFnCondition || groupNoFnCondition;
    if(isInvalidState) {
        console.log('invalid state', noGroupSomeFnCondition, groupNoFnCondition, visibleAttributes.length, groupBy.length, fn)
        return [];
    }

    const originalAttributes = JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [];
    const attributesToFetch = visibleAttributes.map(col => ({
        originalName: col,
        reqName: getColAccessor(getFullCol(col, originalAttributes), groupBy, fn, format.isDms),
        totalName: `SUM(CASE WHEN (${attributeAccessorStr(col, format.isDms, isCalculatedCol(col, originalAttributes))})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${attributeAccessorStr(col, format.isDms, isCalculatedCol(col, originalAttributes))})::numeric ELSE NULL END ) as ${splitColNameOnAS(col)[1] || splitColNameOnAS(col)[0]}_total`,
        resName: splitColNameOnAS(col)[1] || splitColNameOnAS(col)[0] // regular columns won't have 'as', so [1] will only be available for calculated columns
    }))
    const fnColumnsExists = visibleAttributes.some(attr => fn[attr]); // if fns exist, can't pull ids automatically.

    if(!attributesToFetch.length) return [];
    if(format.isDms && !groupBy.length && !fnColumnsExists) attributesToFetch.push({originalName: 'id', reqName: 'id', resName: 'id'})


    console.log('fetching', length, fromIndex, toIndex, attributesToFetch, orderBy, filters[0])
    console.log('calling format filters for data', filters[0])

    const meta =
        originalAttributes?.filter(md => visibleAttributes.includes(md.name) && ['meta-variable', 'geoid-variable', 'meta'].includes(md.display) && md.meta_lookup)
            .reduce((acc, {name, meta_lookup}) => {
                acc[name] = meta_lookup;
                return acc;
            }, {});
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
                meta,
                orderBy: Object.keys(orderBy)
                                .reduce((acc, curr) => {
                                    const isCalcCol = isCalculatedCol(curr, originalAttributes);
                                    const idx = attributesToFetch.findIndex(a => a.originalName === curr) + 1; // +1 for postgres index
                                    if(isCalcCol && idx === 0) return acc;
                                    return {
                                        ...acc,
                                        [ isCalcCol ? idx  : attributeAccessorStr(curr, format.isDms, isCalcCol) ]: orderBy[curr]
                                    }
                                } , {}),
                filter: formatFilters(filters, format.isDms, originalAttributes),
                ...groupBy.length && {groupBy: groupBy.map(col => attributeAccessorStr(col, format.isDms, isCalculatedCol(col, originalAttributes)))},
                ...notNull.length && {exclude: notNull.reduce((acc, col) => ({...acc, [attributeAccessorStr(col, format.isDms, isCalculatedCol(col, originalAttributes))]: ['null']}), {})}
            }),
            attributes: attributesToFetch.map(a => a.reqName).filter(a => a),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        format: {...format, type: format.doc_type}, // view_id already in format.
        attributes: attributesToFetch.map(a => a.reqName).filter(a => a),
        children
    });

    // =============================================== fetch total row =================================================
    if(showTotal) {
        console.log('calling format filters for total', filters[0])
        const totalRowChildren = [{
            type: () => {
            },
            action: actionType,
            path: '/',
            filter: {
                fromIndex: path => 0,
                toIndex: path => 1,
                options: JSON.stringify({
                    aggregatedLen: groupBy.length,
                    filter: formatFilters(filters, format.isDms, originalAttributes),
                    ...notNull.length && {exclude: notNull.reduce((acc, col) => ({...acc, [attributeAccessorStr(col, format.isDms, isCalculatedCol(col, originalAttributes))]: ['null']}), {})}
                }),
                attributes: attributesToFetch.map(a => a.totalName).filter(a => a),
                stopFullDataLoad: true
            },
        }]
        const totalRowData = await apiLoad({
            format: {...format, type: format.doc_type}, // view_id already in format.
            attributes: attributesToFetch.map(a => a.totalName).filter(a => a),
            children: totalRowChildren
        });

        data.push({...totalRowData[0], totalRow: true})
    }
    // ============================================== fetch total row end ==============================================


    console.log('fetched data', data)
    // todo: known bug, and possible solution
    // after changing fn for a column multiple times, all previously selected fns are also included in data.
    // this makes it so that sometimes wrong fn is displayed.
    // find a way to tell which key to use from data.
    // using visible attributes and fn, maybe filter out Object.keys(row)
    return data.map(row => attributesToFetch.reduce((acc, column) => ({
        ...acc,
        totalRow: row.totalRow,
        [column.originalName]: cleanValue(row[row.totalRow ? column.totalName : column.reqName])
    }) , {}));

}

export const getLength = async ({format, apiLoad, filters=[], groupBy=[], notNull=[]}) => {
    const attributes = JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [];
    // console.log('getLen format', format)
    console.log('calling format filters from len', filters[0])
    const children = [{
        type: () => {
        },
        action: 'udaLength',// make this work for dms before trying for dama
        path: '/',
        filter: {
            options: JSON.stringify({
                filter: formatFilters(filters, format.isDms, attributes),
                ...groupBy.length && {groupBy: groupBy.map(col => attributeAccessorStr(col, format.isDms, isCalculatedCol(col, attributes)))},
                ...notNull.length && {exclude: notNull.reduce((acc, col) => ({...acc, [attributeAccessorStr(col, format.isDms, isCalculatedCol(col, attributes))]: ['null']}), {})}
            })
        },
    }]
    const length = await apiLoad({
        format: {...format, type: format.doc_type},
        attributes,
        children
    });
    // console.log('len', length)
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

// used to init data remotely (using template / other update methods).
// Does the bear minimum of returning all args, and updating format object with correct view id.
export const init = async ({format, view, version, attributionData, apiLoad, ...rest}) => {
    const view_id = version || view || format?.view_id;
    const originalDocType = format.originalDocType || format.doc_type;
    const doc_type = `${originalDocType}-${view_id}`


    const updatedFormat = format.doc_type ? {...format, doc_type, originalDocType, view_id: view_id?.id} : {...format, view_id: view_id?.id}
    const updatedAttributionData = {source_id: attributionData.source_id, view_id, version: view_id}
    const newSetup = {
        format: updatedFormat,
        view: view_id,
        attributionData: updatedAttributionData,
        ...rest
    }

    if(apiLoad){
        const length = await getLength({...newSetup, apiLoad});
        const data = await getData({...newSetup, length, apiLoad});
        console.log('do i fucking get called?', length, data, newSetup)
        return  {...newSetup, data}
    }

    return newSetup
}