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

const columnRenameRegex = /\s+as\s+/i;
const splitColNameOnAS = name => name.split(columnRenameRegex); // split on as/AS/aS/As and spaces surrounding it

// takes in column, and returns if it's a calculated column
const isCalculatedCol = ({display, type, origin}) => {
    return display === 'calculated' || type === 'calculated' || origin === 'calculated-column'
};

// applies data->> and AS on a column name
export const formattedAttributeStr = (col, isDms, isCalculatedCol) => isCalculatedCol ? col : isDms ? `data->>'${col}' as ${col}` : col;
// returns column name to be used as key for options. these are names without 'as' and data->> applied.
export const attributeAccessorStr = (col, isDms, isCalculatedCol) => isCalculatedCol ? splitColNameOnAS(col)[0] : isDms ? `data->>'${col}'` : col;

const formatFilters = (filters, isDms, attributes) => {
    const res = filters
        // .filter(f => f.valueSets?.length && f.valueSets.filter(fv => fv.length).length)
        .reduce((acc, f) => {
            const attr = attributeAccessorStr(f.column, isDms, isCalculatedCol(f.column)) //todo: fix for updated isCalculatedCol
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



const cleanValue = value => typeof value === 'boolean' ? JSON.stringify(value) :
                                typeof value === "object" && value?.value ? cleanValue(value.value) :
                                    typeof value === "object" && !value?.value ? undefined :
                                        typeof value === 'string' ? parseIfJson(value) :
                                            parseIfJson(value);



export const applyFn = (col={}, isDms=false) => {
    // apply fns if: column is not calculated column or it is calculated, and does not have function in name

    // calculated columns should never get data->>
    const isCalculatedCol = col.type === 'calculated' || col.display === 'calculated' || col.origin === 'calculated-column';
    const colNameWithAccessor = attributeAccessorStr(col.name, isDms, isCalculatedCol);
    const colNameAfterAS = isCalculatedCol ? splitColNameOnAS(col.name)[1] : col.name;

    const functions = {
        [undefined]: `${colNameWithAccessor} as ${colNameAfterAS}`,
        '': `${colNameWithAccessor} as ${colNameAfterAS}`,
        list: `array_to_string(array_agg(distinct ${colNameWithAccessor}), ', ') as ${colNameAfterAS}`,
        sum: `sum(${colNameWithAccessor}) as ${colNameAfterAS}`,
        count: `count(${colNameWithAccessor}) as ${colNameAfterAS}`,
    }

    return functions[col.fn]
}

// returns column names with fns applied. these are actually what gets used to fetch values.
const getColAccessor = (col, isDms) => !col ? null : applyFn(col, isDms);

export const getLength = async ({options, state, apiLoad}) => {
    const {filter, groupBy, exclude} = options;
    const children = [{
        type: () => {
        },
        action: 'udaLength',
        path: '/',
        filter: {options: JSON.stringify({filter, groupBy, exclude})},
    }]

    const length = await apiLoad({
        format: state.sourceInfo,
        children
    });
    // console.log('len', length)
    return length;
}

const getFullColumn = (columnName, columns) => columns.find(col => col.name === columnName);

export const getData = async ({state, apiLoad, currentPage=0}) => {
    console.log('=======getDAta called===========')
    // get columns with all settings and info about them.
    const columnsWithSettings = state.columns.filter(({actionType}) => !actionType).map(column => {
        const fullColumn = {
            ...(state.sourceInfo.columns.find(originalColumn => originalColumn.name === column.name) || {}),
            ...column,
        }
        const isCalculatedColumn = isCalculatedCol(column);
        const reqName = getColAccessor(fullColumn, state.sourceInfo.isDms);
        const refName = attributeAccessorStr(column.name, state.sourceInfo.isDms, isCalculatedColumn);
        const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);
        const totalName = `SUM(CASE WHEN (${refName})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${refName})::numeric ELSE NULL END ) as ${colNameAfterAS || colNameBeforeAS}_total`;
        return {
            ...fullColumn,
            isCalculatedColumn, // currently this cached value is used to determine key of order by column. for calculated columns idx is used to avoid sql errors.
            reqName, // used to fetch data. name with fn, data->> (is needed), and 'as'
            refName, // used to reference column name with appropriate data->>, and without 'as'
            totalName, // used to make total row calls.
        }
    })
    const columnsToFetch = columnsWithSettings.filter(column => column.show);
    console.log('columns with settings:', columnsWithSettings, columnsToFetch);
    const {groupBy=[], orderBy={}, filter={}, fn={}, exclude={}, meta={}} = state.dataRequest;
    // should this be saved in state directly?
    const options = {
        groupBy: groupBy.map(columnName => getFullColumn(columnName, columnsWithSettings)?.refName),
        orderBy: Object.keys(orderBy)
            .filter(columnName => columnsToFetch.find(ctf => ctf.name === columnName)) // take out any sort from non-visible column
            .reduce((acc, columnName) => {
                const idx = columnsToFetch.findIndex(a => a.name === columnName) + 1; // +1 for postgres index
                const {refName, isCalculatedColumn} = getFullColumn(columnName, columnsToFetch);

                return {...acc, [isCalculatedColumn ? idx : refName]: orderBy[columnName] }
            }, {}),
        filter: Object.keys(filter).reduce((acc, columnName) => {
            const refName = getFullColumn(columnName, columnsWithSettings)?.refName;
            return {...acc, [refName]: filter[columnName]}
        } , {}), // todo: for now, use filters as they come. later, for multiselect columns, fetch valuesets.
        exclude: Object.keys(exclude).reduce((acc, columnName) => ({...acc, [getFullColumn(columnName, columnsWithSettings)?.refName]: exclude[columnName] }), {}),
        meta
    }
    console.log('options for spreadsheet getData', options, state)
    // =================================================================================================================
    // ========================================== check for proper indices begin =======================================
    // =================================================================================================================
    const length = await getLength({options, state, apiLoad});
    const actionType = 'uda';
    const fromIndex = currentPage * state.display.pageSize;
    const toIndex = Math.min(length, currentPage * state.display.pageSize + state.display.pageSize) - 1;
    if(fromIndex > length) {
        console.log('going over limit', fromIndex, toIndex, length);
        return {length, data: []}
    };
    console.log('indices', currentPage, state.display.pageSize, length)
    // ========================================== check for proper indices end =========================================

    // =================================================================================================================
    // ======================================= check for attributes to fetch begin =====================================
    // =================================================================================================================
    const fnColumnsExists = columnsToFetch.some(column => column.fn); // if fns exist, can't pull ids automatically.

    if(!columnsToFetch.length) {
        console.log('can not find columns to fetch', columnsToFetch);
        return {length, data: []}
    };
    if(state.sourceInfo.isDms && !options.groupBy.length && !fnColumnsExists) {
        columnsToFetch.push({name: 'id', reqName: 'id'});
        options.orderBy.id = Object.values(options.orderBy || {})?.[0] || 'asc';
    }else {
        const idx = columnsToFetch.findIndex(column => column.name === 'id');
        if(idx !== -1) columnsToFetch.splice(idx, 1);
        delete options.orderBy.id
    }
    // ======================================= check for attributes to fetch end =======================================


    // =================================================================================================================
    // ========================================= check for invalid state begin =========================================
    // =================================================================================================================

    // invalid state: while NOT grouping by, there are some columns with fn applied. either all of them need fn, or none.
    const nonGroupedColumnsLength = columnsWithSettings.filter(va => va.show && !va.group).length
    const visibleColumnsLength =  columnsWithSettings.filter(va => va.show).length;
    const groupedColumnsLength = columnsWithSettings.filter(va => va.group).length;
    const fnColumnsLength = columnsWithSettings.filter(va => va.fn).length;
    // no column is grouped by, and fns don't equal visible columns (using length but maybe more nuanced matching can be used)
    const noGroupSomeFnCondition = visibleColumnsLength > 1 && !groupedColumnsLength && fnColumnsLength > 0 && fnColumnsLength !== visibleColumnsLength;

    // grouping by some column(s), but fns don't equal non-grouped columns (using length but maybe more nuanced matching can be used)
    const groupNoFnCondition = groupedColumnsLength && fnColumnsLength !== nonGroupedColumnsLength; // while grouping, all the non-grouped columns should have a fn
    const isInvalidState = noGroupSomeFnCondition || groupNoFnCondition;

    if(isInvalidState) {
        console.log('invalid state', noGroupSomeFnCondition, groupNoFnCondition, visibleColumnsLength, groupedColumnsLength, fnColumnsLength)
        return {length, data: []};
    }
    // ========================================== check for invalid state end ==========================================

    const children = [{
        type: () => {
        },
        action: actionType,
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify(options),
            attributes: columnsToFetch.map(a => a.reqName).filter(a => a),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        format: state.sourceInfo,
        children
    });

    // =================================================================================================================
    // =========================================== fetch total row begin  ==============================================
    // =================================================================================================================
    if(state.display.showTotal) {
        const totalRowChildren = [{
            type: () => {
            },
            action: actionType,
            path: '/',
            filter: {
                fromIndex: path => 0,
                toIndex: path => 1,
                options: JSON.stringify({
                    filter: options.filter,
                    exclude: options.exclude,
                }),
                attributes: columnsToFetch.map(a => a.totalName).filter(a => a),
                stopFullDataLoad: true
            },
        }]
        const totalRowData = await apiLoad({
            format: state.sourceInfo,
            children: totalRowChildren
        });

        data.push({...totalRowData[0], totalRow: true})
    }
    // ============================================== fetch total row end ==============================================

    return {
        length,
        data: data.map(row => columnsToFetch.reduce((acc, column) => ({
            ...acc,
            totalRow: row.totalRow,
            // return data with columns' original names
            [column.name]: cleanValue(row[row.totalRow ? column.totalName : column.reqName])
        }) , {}))
    }
}

export const convertToUrlParams = (arr, delimiter) => {
    const params = new URLSearchParams();

    arr.forEach(item => {
        const { column, values = [] } = item;
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
    });

    return params.toString();
};

// used to init data remotely (using template / other update methods).
// Does the bear minimum of returning all args, and updating format object with correct view id.
// export const init = async ({format, view, version, attributionData, apiLoad, ...rest}) => {
//     // todo update
//     const view_id = version || view || format?.view_id;
//     const originalDocType = format.originalDocType || format.doc_type;
//     const doc_type = `${originalDocType}-${view_id}`
//
//
//     const updatedFormat = format.doc_type ? {...format, doc_type, originalDocType, view_id: view_id?.id} : {...format, view_id: view_id?.id}
//     const updatedAttributionData = {source_id: attributionData.source_id, view_id, version: view_id}
//     const newSetup = {
//         format: updatedFormat,
//         view: view_id,
//         ...rest
//     }
//
//     if(apiLoad){
//         const data = await getData({...newSetup, apiLoad});
//         return  {...newSetup, data}
//     }
//
//     return newSetup
// }

export const getNestedValue = value => value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) : !value?.value && typeof value?.value === 'object' ? '' : value;

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const formatFunctions = {
    'abbreviate': (d, isDollar) => fnumIndex(d, 1, isDollar),
    'comma': (d, isDollar) => fnum(d, isDollar)
}