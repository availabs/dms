import {useCallback, useEffect} from 'react'
import { getData as getFilterData } from "../components/filters/utils";
import {isEqual, uniq} from "lodash-es";
//import {Icon} from "../../../../index";

const Icon = () => <div />
const operationToExpressionMap = {
    filter: 'IN',
    exclude: 'NOT IN',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<='
}

const fnToTextMap = {
    list: (colNameBeforeAs, colNameAfterAS) => `array_to_string(array_agg(distinct ${colNameBeforeAs}), ', ') as ${colNameAfterAS}`,
    default: (colNameBeforeAs, colNameAfterAS, fn='max') => `${fn}(${colNameBeforeAs}) as ${colNameAfterAS}`
}
const operations = {
    gt: (a, b) => +a > +b,
    gte: (a, b) => +a >= +b,
    lt: (a, b) => +a < +b,
    lte: (a, b) => +a <= +b,
    like: (a,b) => b.toString().toLowerCase().includes(a.toString().toLowerCase())
}

export const useHandleClickOutside = (menuRef, menuBtnId, onClose) => {
    const handleClickOutside = useCallback(
        (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                e.target.id !== menuBtnId
            ) {
                onClose();
            }
        },
        [menuRef, menuBtnId, onClose]
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleClickOutside]);
};

const fnum = (number, currency = false) => `${currency ? '$ ' : ''} ${isNaN(number) ? 0 : parseInt(number).toLocaleString()}`;
export const fnumIndex = (d, fractions = 2, currency = false) => {
        if(isNaN(d)) return '0'
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
export const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

const columnRenameRegex = /\s+as\s+/i;
const splitColNameOnAS = name => name.split(columnRenameRegex); // split on as/AS/aS/As and spaces surrounding it

// takes in column, and returns if it's a calculated column
const isCalculatedCol = ({display, type, origin}) => {
    return display === 'calculated' || type === 'calculated' || origin === 'calculated-column'
};

// returns column name to be used as key for options. these are names without 'as' and data->> applied.
export const attributeAccessorStr = (col, isDms, isCalculatedCol, isSystemCol) =>
    isCalculatedCol || isSystemCol || splitColNameOnAS(col)[0]?.includes('data->>') ?
        splitColNameOnAS(col)[0] :
            isDms ? `data->>'${col}'` : col;

const parseIfJson = value => { try { return JSON.parse(value) } catch (e) { return value } }



const cleanValue = value => typeof value === 'boolean' ? JSON.stringify(value) :
                                Array.isArray(value) ? value : // this will be calculated column only.
                                    typeof value === "object" && value?.value ? cleanValue(value.value) :
                                        typeof value === "object" && !value?.value ? undefined :
                                            typeof value === 'string' ? parseIfJson(value) :
                                                parseIfJson(value);



export const applyFn = (col={}, isDms=false) => {
    // apply fns if: column is not calculated column or it is calculated, and does not have function in name

    // calculated columns should never get data->>
    const isCalculatedCol = col.type === 'calculated' || col.display === 'calculated' || col.origin === 'calculated-column';
    const colNameWithAccessor = attributeAccessorStr(col.name, isDms, isCalculatedCol, col.systemCol);
    const colNameAfterAS = (isCalculatedCol ? splitColNameOnAS(col.name)[1] : col.name).toLowerCase();

    const functions = {
        [undefined]: `${colNameWithAccessor} as ${colNameAfterAS}`,
        '': `${colNameWithAccessor} as ${colNameAfterAS}`,
        list: `array_to_string(array_agg(distinct ${colNameWithAccessor}), ', ') as ${colNameAfterAS}`,
        sum: isDms ? `sum((${colNameWithAccessor})::integer) as ${colNameAfterAS}` : `sum(${colNameWithAccessor}) as ${colNameAfterAS}`,
        avg: isDms ? `avg((${colNameWithAccessor})::integer) as ${colNameAfterAS}` : `avg(${colNameWithAccessor}) as ${colNameAfterAS}`,
        count: `count(${colNameWithAccessor}) as ${colNameAfterAS}`,
        max: `max(${colNameWithAccessor}) as ${colNameAfterAS}`,
    }

    return functions[col.fn]
}

// returns column names with fns applied. these are actually what gets used to fetch values.
const getColAccessor = (col, isDms) => !col ? null : applyFn(col, isDms);

export const getLength = async ({options, state, apiLoad}) => {
    const {orderBy, meta, ...optionsForLen} = options;
    const children = [{
        type: () => {
        },
        action: 'udaLength',
        path: '/',
        filter: {options: JSON.stringify(optionsForLen)},
    }]

    const length = await apiLoad({
        format: state.sourceInfo,
        children
    });
    return length;
}

const getFullColumn = (columnName, columns) => columns.find(col => col.name === columnName);

export const getColumnLabel = column => column.customName || column.display_name || column.name;

const evaluateAST = (node, values) => {
    if (node.type === 'variable') {
        return values[node.key] ?? 0; // Default value handling
    }

    const left = evaluateAST(node.left, values);
    const right = evaluateAST(node.right, values);

    switch (node.operation) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right !== 0 ? left / right : NaN;
        default: return undefined //throw new Error(`Unknown operation: ${node.operation}`);
    }
};

export const getData = async ({state, apiLoad, fullDataLoad, currentPage=0}) => {
    const {groupBy=[], orderBy={}, filter={}, normalFilter=[], fn={}, exclude={}, meta={}, ...restOfDataRequestOptions} = state.dataRequest;

    const debug = true;
    debug && console.log('=======getDAta called===========')
    // get columns with all settings and info about them.
    const columnsWithSettings = state.columns.filter(({actionType, type}) => !actionType && type !== 'formula').map(column => {
        const fullColumn = {
            ...(state.sourceInfo.columns.find(originalColumn => originalColumn.name === column.name) || {}),
            ...column,
        }
        const isCalculatedColumn = isCalculatedCol(column);
        const isCopiedColumn = !column.isDuplicate && state.columns.some(({name, isDuplicate}) => name === column.name && isDuplicate);
        const reqName = getColAccessor(fullColumn, state.sourceInfo.isDms);
        const refName = attributeAccessorStr(column.name, state.sourceInfo.isDms, isCalculatedColumn, column.systemCol);
        const [colNameBeforeAS, colNameAfterAS] = splitColNameOnAS(column.name);
        const totalName = `SUM(CASE WHEN (${refName})::text ~ '^-?\\d+(\\.\\d+)?$' THEN (${refName})::numeric ELSE NULL END ) as ${colNameAfterAS || colNameBeforeAS}_total`;
        return {
            ...fullColumn,
            isCalculatedColumn, // currently this cached value is used to determine key of order by column. for calculated columns idx is used to avoid sql errors.
            isCopiedColumn, // this column has copies
            reqName, // used to fetch data. name with fn, data->> (is needed), and 'as'
            refName, // used to reference column name with appropriate data->>, and without 'as'
            totalName, // used to make total row calls.
        }
    })
    const columnsToFetch = columnsWithSettings.filter(column => column.show && !column.isDuplicate && column.type !== 'formula');
    // collect variables used in formula columns, and add them to fetch list
    const formulaVariableColumns = columnsWithSettings.filter(column => column.type === 'formula')
        .reduce((acc, curr) => {
            const variablesYetToBeFetched = curr.variables.filter(variable => !columnsToFetch.find(ctf => isEqualColumns(ctf, variable)));
            acc.push(...variablesYetToBeFetched)
            return acc;
        }, [])
    if(formulaVariableColumns.length){
        columnsToFetch.push(formulaVariableColumns)
    }

    // add normal columns to the list of columns to fetch
    if(normalFilter.length){
        const normalColumns = [];
        const valueColumnName = state.columns.find(col => col.valueColumn)?.name || 'value';
        const fullColumn = getFullColumn(valueColumnName, columnsWithSettings);
        const valueColumn = fullColumn?.refName || 'value';
        normalFilter.forEach(({column, values, operation, fn}, i) => {
            const fullColumn = state.columns.find(col => col.name === column && isEqual(values, col.filters[0]?.values));
            if(column && fullColumn?.normalName && values?.length){
                const name = fullColumn.normalName;
                const filterValues = ['gt', 'gte', 'lt', 'lte'].includes(operation) && Array.isArray(values) ? values[0] :
                    Array.isArray(values) ? values.map(v => `'${v}'`) : values;
                const nameBeforeAS = `CASE WHEN ${column} ${operationToExpressionMap[operation] || 'IN'} (${filterValues}) THEN ${valueColumn} END`;
                const reqName = fnToTextMap[fn] ? fnToTextMap[fn](nameBeforeAS, name) : fnToTextMap.default(nameBeforeAS, name, fn);
                normalColumns.push({name, reqName});
            }
        })

        if(normalColumns.length) columnsToFetch.push(...normalColumns);
        debug && console.log('debug getdata: columns with settings, columns to fetch:', columnsWithSettings, columnsToFetch);
    }

    const multiselectValueSets = {};
    const filterAndExcludeColumns = [...Object.keys(filter), ...Object.keys(exclude).filter(col => !(exclude[col]?.length === 1 && exclude[col][0] === 'null'))]
    for (const columnName of uniq(filterAndExcludeColumns)) {
        const { name, display, meta, refName, type } = getFullColumn(columnName, columnsWithSettings);
        const fullColumn = { name, display, meta, refName, type };
        const reqName = getColAccessor({ ...fullColumn, fn: undefined }, state.sourceInfo.isDms);

        const selectedValues =
            (filter[columnName] || exclude[columnName] || [])
                .map(o => o?.value || o)
                .map(o => o === null ? 'null' : o)
                .filter(o => o);

        if (!selectedValues.length) continue;

        if (type === 'multiselect'/* || type === 'calculated'*/) {
            const options = await getFilterData({
                reqName,
                refName,
                allAttributes: [{ name, display, meta }],
                apiLoad,
                format: state.sourceInfo
            });

            try {
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

                if(selectedValues.includes('null')) matchedOptions.push('null')
                multiselectValueSets[columnName] = matchedOptions;
            } catch (e) {
                console.error('Could not load options for', columnName, e);
            }
        }
    }

    // should this be saved in state directly?
    const options = {
        groupBy: groupBy.map(columnName => getFullColumn(columnName, columnsWithSettings)?.refName),
        orderBy: Object.keys(orderBy)
            .filter(columnName => columnsToFetch.find(ctf => ctf.name === columnName)) // take out any sort from non-visible column
            .reduce((acc, columnName) => {
                const idx = columnsToFetch.findIndex(a => a.name === columnName) + 1; // +1 for postgres index
                const {refName, reqName, isCalculatedColumn} = getFullColumn(columnName, columnsToFetch);
                const [reqNameWithoutAS] = splitColNameOnAS(reqName);

                // return {...acc, [isCalculatedColumn ? idx : reqNameWithoutAS]: orderBy[columnName] }
                return {...acc, [reqNameWithoutAS]: orderBy[columnName] }
            }, {}),
        filter: Object.keys(filter).reduce((acc, columnName) => {
            const {refName, type} = getFullColumn(columnName, columnsWithSettings);
            const valueSets = multiselectValueSets[columnName] ? (multiselectValueSets[columnName]).filter(d => d === 'null' || d.length) : (filter[columnName] || []);
            if(!valueSets?.length) return acc;
            return {...acc, [refName]: valueSets}
        } , {}),
        exclude: Object.keys(exclude).reduce((acc, columnName) => {
            const currValues = exclude[columnName] || [];
            const finalValues = currValues?.length === 1 && currValues[0] === 'null' ? currValues :
                multiselectValueSets[columnName] ? (multiselectValueSets[columnName]).filter(d => d.length) : currValues;
            return {...acc, [getFullColumn(columnName, columnsWithSettings)?.refName]: finalValues}
        }, {}),
        normalFilter,
        meta,
        ...(() => {
            const where = {};
            const having = [];

            Object.keys(restOfDataRequestOptions).forEach((filterOperation) => {
                const columnsForOperation = Object.keys(restOfDataRequestOptions[filterOperation]);

                columnsForOperation.forEach((columnName) => {
                    const { refName, reqName, fn, filters, ...restCol } = getFullColumn(columnName, columnsWithSettings);
                    const reqNameWithoutAS = splitColNameOnAS(reqName)[0];
                    const currOperationValues = restOfDataRequestOptions[filterOperation][columnName];
                    const valueToFilterBy = Array.isArray(currOperationValues) ? currOperationValues[0] : currOperationValues;

                    if (valueToFilterBy == null) return;

                    const fullFilter = filters?.[0];
                    const filterFn = fullFilter?.fn;

                    const isAggregated = /*!!fn ||*/ !!filterFn;
                    const filterExpr = isAggregated
                        ? splitColNameOnAS(
                            fn
                                ? reqNameWithoutAS
                                : applyFn({ ...restCol, fn: filterFn }, state.sourceInfo.isDms)
                        )[0]
                        : refName;
                    if (isAggregated) {
                        having.push(`${filterExpr} ${operationToExpressionMap[filterOperation]} ${valueToFilterBy}`);
                    } else {
                        if (!where[filterOperation]) {
                            where[filterOperation] = {};
                        }
                        where[filterOperation][filterExpr] = valueToFilterBy;
                    }
                });
            });

            return {
                ...(Object.keys(where).length > 0 && where),
                ...(having.length > 0 && { having })
            };
        })()
        // // when not grouping, numeric filters can directly go in the request
        // ...(!groupBy.length || true) && Object.keys(restOfDataRequestOptions).reduce((acc, filterOperation) => {
        //     const columnsForOperation = Object.keys(restOfDataRequestOptions[filterOperation]);
        //     acc[filterOperation] =
        //         columnsForOperation.reduce((acc, columnName) => {
        //             const {refName, reqName, fn} = getFullColumn(columnName, columnsWithSettings);
        //             const reqNameWithoutAS = splitColNameOnAS(reqName)[0];
        //             // if grouping by and fn is applied, use fn name.
        //             const columnNameToFilterBy = refName;
        //             const currOperationValues = restOfDataRequestOptions[filterOperation][columnName];
        //
        //             acc[columnNameToFilterBy] = Array.isArray(currOperationValues) ? currOperationValues[0] : currOperationValues;
        //             return acc;
        //         }, {});
        //     return acc;
        // }, {}),
        // // if grouping, apply numeric filters as HAVING clause
        // ...groupBy.length && {
        //     having: Object.keys(restOfDataRequestOptions).reduce((acc, filterOperation) => {
        //         const columnsForOperation = Object.keys(restOfDataRequestOptions[filterOperation]);
        //
        //         const conditions = columnsForOperation.map((columnName) => {
        //                 const {reqName, fn, filters, ...restCol} = getFullColumn(columnName, columnsWithSettings);
        //                 // assuming one filter per column:
        //                 const fullFilter = filters[0];
        //                 const filterFn = fullFilter?.fn;
        //
        //                 const reqNameWithoutAS = splitColNameOnAS(reqName)[0];
        //
        //                 const reqNameWithFn = fn ? reqNameWithoutAS :
        //                     applyFn(
        //                         {...restCol, fn: filterFn},
        //                         state.sourceInfo.isDms);
        //                 const reqNameWithFnWithoutAS = splitColNameOnAS(reqNameWithFn)[0];
        //                 // if grouping by and fn is applied, use fn name.
        //                 const currOperationValues = restOfDataRequestOptions[filterOperation][columnName];
        //                 const valueToFilterBy = Array.isArray(currOperationValues) ? currOperationValues[0] : currOperationValues;
        //                 if(!valueToFilterBy) return null
        //             return `${reqNameWithFnWithoutAS} ${operationsStr[filterOperation]} ${valueToFilterBy}`;
        //             }).filter(c => c);
        //
        //         acc.push(...conditions)
        //         return acc;
        //     }, [])
        // }
    }
    debug && console.log('debug getdata: options for spreadsheet getData', options, state)
    // =================================================================================================================
    // ========================================== check for proper indices begin =======================================
    // =================================================================================================================
    // not grouping by, and all visible columns have fn applied
    const isRequestingSingleRow = !options.groupBy.length && columnsToFetch.filter(col => col.fn).length === columnsToFetch.length;
    const length = isRequestingSingleRow ? 1 : await getLength({options, state, apiLoad});
    console.log('get data length', length)
    const actionType = 'uda';
    const fromIndex = fullDataLoad ? 0 : currentPage * state.display.pageSize;
    const toIndex = fullDataLoad ? length : Math.min(length, currentPage * state.display.pageSize + state.display.pageSize) - 1;
    if(fromIndex > length) {
        debug && console.log('debug getdata: going over limit', fromIndex, toIndex, length);
        return {length, data: []}
    }
    debug && console.log('debug getdata: indices', currentPage, state.display.pageSize, length)
    // ========================================== check for proper indices end =========================================

    // =================================================================================================================
    // ======================================= check for attributes to fetch begin =====================================
    // =================================================================================================================
    const fnColumnsExists = columnsToFetch.some(column => column.fn); // if fns exist, can't pull ids automatically.

    if(!columnsToFetch.length) {
        debug && console.log('debug getdata: can not find columns to fetch', columnsToFetch);
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
        debug && console.log('debug getdata: invalid state', noGroupSomeFnCondition, groupNoFnCondition, visibleColumnsLength, groupedColumnsLength, fnColumnsLength)
        const invalidStateText = noGroupSomeFnCondition ?
            `All visible columns don't have a function. # Visible columns: ${visibleColumnsLength}, # Function applied: ${fnColumnsLength}` :
            groupNoFnCondition ? `All Non grouped columns must have a function applied. # Non grouped columns: ${nonGroupedColumnsLength}, # Function applied: ${fnColumnsLength}.` : ''
        return {length, data: [], invalidState: invalidStateText};
    }
    // ========================================== check for invalid state end ==========================================

    const children = [{
        type: () => {
        },
        action: actionType,
        path: '/',
        filter: {
            fromIndex: fromIndex,
            toIndex: toIndex,
            options: JSON.stringify(options),
            attributes: columnsToFetch.map(a => a.reqName).filter(a => a),
            stopFullDataLoad: true
        },
    }]
    let data;
    try{
        console.log('getting data',{
            format: state.sourceInfo,
            children
        })
        data = await apiLoad({
            format: state.sourceInfo,
            children
        }, '/');
    }catch (e) {
        if (process.env.NODE_ENV === "development") console.error(e)
        return {length, data: [], invalidState: 'An Error occurred while fetching data.'};
    }

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
                fromIndex: 0,
                toIndex: 1,
                options: JSON.stringify({
                    filter: options.filter,
                    exclude: options.exclude,
                }),
                attributes: columnsToFetch.map(a => a.totalName).filter(a => a),
                stopFullDataLoad: true
            },
        }]

        let totalRowData;
        try{
            totalRowData = await apiLoad({
                format: state.sourceInfo,
                children: totalRowChildren
            });
        }catch (e) {
            if (process.env.NODE_ENV === "development") console.error(e)
            return {length, data: [], invalidState: 'An Error occurred while fetching data.'};
        }

        data.push({...totalRowData[0], totalRow: true})
    }
    // ============================================== fetch total row end ==============================================
    // console.log('debug getdata', data,
    //     data.map(row => columnsToFetch.reduce((acc, column) => ({
    //         ...acc,
    //         totalRow: row.totalRow,
    //         // return data with columns' original names
    //         [column.name]: cleanValue(row[row.totalRow ? column.totalName : column.reqName])
    //     }) , {}))
    //
    //     )
    console.log('got data', data)
    return {
        length,
        data: data.map(row => {
            const rowWithData = columnsToFetch.reduce((acc, column) => ({
                ...acc,
                totalRow: row.totalRow,
                // return data with columns' original names
                [column.name]: cleanValue(row[row.totalRow ? column.totalName : column.reqName])
            }), {});

            const formulaColumns = state.columns.filter(({type}) => type === 'formula');

            if (formulaColumns.length) {
                formulaColumns.forEach(({name, formula}) => {
                    rowWithData[name] = evaluateAST(formula, rowWithData);
                })
            }

            return rowWithData;
        })
    }
}

export const convertToUrlParams = (arr, delimiter) => {
    const params = new URLSearchParams();

    arr.forEach(item => {
        const { column, values = [] } = item;
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).map(v => Array.isArray(v) ? v.join(delimiter) : v).join(delimiter));
    });

    return params.toString();
};

export const getNestedValue = value => value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) : !value?.value && typeof value?.value === 'object' ? '' : value;

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const strColorMap = {
    'Very High Risk': '#AA2E26',
    'High Risk': '#DD524C',
    'Moderate Risk': '#EA8954',
    'Low Risk': '#F1CA87',
    'Very Low Risk': '#54B99B',
    default: '#ccc'
}

const formatDate = (dateString) => {
    const options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"

    };
    return dateString ? new Date(dateString).toLocaleDateString(undefined, options) : ``;
};
export const formatFunctions = {
    'abbreviate': (d, isDollar) => fnumIndex(d, 1, isDollar),
    'abbreviate_dollar': (d) => fnumIndex(d, 1, true),
    'comma': (d, isDollar) => fnum(d, isDollar),
    'comma_dollar': (d) => fnum(d, true),
    'zero_to_na': d => !d || (d && +d === 0) || d === '0' ? 'N/A' : d,
    'date': (d) => formatDate(d),
    'icon': (strValue, props, Icon) => <><Icon icon={strValue} className={'size-8'} {...props}/> <span>{strValue}</span></>,
    'color': (strValue, map) => <>
        <div style={{borderRadius: '1000px', height: '10px', width: '10px', backgroundColor: map?.[strValue] || strColorMap[strValue] || strColorMap.default}} />
        <div>{strValue}</div>
    </>
}