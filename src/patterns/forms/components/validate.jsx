import React, {useContext, useEffect, useMemo, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router'
import {
    applyFn,
    attributeAccessorStr, isJson
} from "../../page/components/selector/dataWrapper/utils/utils";
import {cloneDeep, isEqual, uniq, uniqBy} from "lodash-es";
import {ComponentContext} from "../../page/context"
import dataTypes from "../../../data-types";
import {useImmer} from "use-immer";
import {
    getData as getFilterData
} from "../../page/components/selector/dataWrapper/components/filters/utils";
import Spreadsheet from "../../page/components/selector/ComponentRegistry/spreadsheet";
import {Filter, FilterRemove} from "../ui/icons";
import SourcesLayout from "../../forms/components/patternListComponent/layout";
import {Controls} from "../../page/components/selector/dataWrapper/components/Controls";
import {
    RenderFilters
} from "../../page/components/selector/dataWrapper/components/filters/RenderFilters";
import DataWrapper from "../../page/components/selector/dataWrapper";


const getErrorValueSql = (fullName, shortName, options, required, type) => {
    const sql = `SUM(CASE ${required ? `WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN 1` : ``}
              ${
        options?.length ?
            (type === 'multiselect' ?
                `WHEN NOT data->'${fullName}' <@  '[${options.map(o => `"${(o?.value || o).replace(/'/, "''")}"`)}]'::jsonb THEN 1` :
                `WHEN data->>'${fullName}' NOT IN (${options.map(o => `'${(o?.value || o).replace(/'/, "''")}'`)}) THEN 1`) : ``
    } ELSE 0 END) AS ${shortName}_error`.replaceAll('\n', ' ');
    // if(fullName.includes('existing_') || fullName.includes('date')) console.log('# sql', sql)
    return sql;
}

// multiselect && required
// multiselect && !required
// select && required
// select && !required
// text && required
const getInvalidValuesSql = (fullName, shortName, options, required, type) => {
    const sql = (type === 'multiselect' && (required || options?.length) ?
        `array_agg(CASE 
                        ${required ? `WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN data->'${fullName}'` : ``}
                        ${options?.length ? `WHEN NOT data->'${fullName}' <@  '[${options.map(o => `"${(o?.value || o).replace(/'/, "''")}"`)}]'::jsonb THEN data->'${fullName}' ELSE '"__VALID__"'::jsonb` : ``}
                   END) AS ${shortName}_invalid_values` :
        type === 'select' && (required || options?.length) ?
            `array_agg(CASE 
                            ${required ? `WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN data->>'${fullName}'` : ``}
                            ${options?.length ? `WHEN data->>'${fullName}' NOT IN (${options.map(o => `'${(o?.value || o).replace(/'/, "''")}'`)}) THEN data->>'${fullName}' ELSE '"__VALID__"'` : ``}
                       END) AS ${shortName}_invalid_values` :
            !['select', 'multiselect'].includes(type) && required ?
                `array_agg(CASE WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN data->>'${fullName}' ELSE '"__VALID__"' END) AS ${shortName}_invalid_values` :
                ``).replaceAll('\n', ' ');
    // if(fullName.includes('existing_') || fullName.includes('date')) console.log('sql', sql)
    return sql;
}

const getFullColumn = (columnName, columns) => {
    const col = columns.find(col => col.name === columnName);
    if(!col) console.log('col not found', columnName)
    return col || {}
}
const getColAccessor = (col, isDms) => !col ? null : applyFn(col, isDms);
const isCalculatedCol = ({display, type, origin}) => {
    return display === 'calculated' || type === 'calculated' || origin === 'calculated-column'
};
const filterValueDelimiter = '|||';

const reValidate = async ({app, type, parentId, parentDocType, dmsServerPath, setValidating, setError, falcor}) => {
    try {
        setValidating(true)
        const body = {
            parentId, // optional. if passed, used to pull metadata
            parentDocType // to fetch metadata on server, using app, and this doc_type. so we don't rely on client
        }
        const res = await fetch(`${dmsServerPath}/dms/${app}+${type}/validate`,
            {
                method: "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                },
            });
        await falcor.invalidate(['uda', `${app}+${type}`]);
        await falcor.invalidate(['uda']);
        const publishFinalEvent = await res.json();
        setValidating(false)
        // window.location = window.location;
    }catch (e){
        setValidating(false);
        setError(e)
    }
}
const getFilterFromSearchParams = searchParams => Array.from(searchParams.keys()).reduce((acc, column) => ({
    ...acc,
    [column]: searchParams.get(column)?.split(filterValueDelimiter)?.filter(d => d.length),
}), {});

const getInitState = ({columns, default_columns=[], state={}, app, doc_type, view_id, data, searchParams}) => {
    const res = {
        dataRequest: {filter: getFilterFromSearchParams(searchParams)},
        data: [],
        columns: uniqBy([
            ...default_columns.map(dc => {
                const rawColumn = columns.find(c => c.name === dc.name)
                const stateColumn = Array.isArray(state?.columns) && state.columns.length && state.columns.find(c => c.name === dc.name) || {}
                if (!rawColumn) return undefined;
                return {...rawColumn, ...stateColumn}
            }).filter(dc => dc), // default columns

            ...columns.filter(({name, shortName}) => {
                // error columns + state columns - default columns
                const cdn1 = (!default_columns.some(dc => dc.name === name) && data[`${shortName}_error`])
                const cdn2 = (Array.isArray(state?.columns) && state.columns.length && state.columns.some(c => c.name === name))
                return cdn1 || cdn2
            })
            //     .map(dc => {
            //     const rawColumn = columns.find(c => c.name === dc.name)
            //     const stateColumn = Array.isArray(state?.columns) && state.columns.length && state.columns.find(c => c.name === dc.name) || {}
            //     if (!rawColumn) return undefined;
            //     return {...rawColumn, ...stateColumn}
            // }).filter(dc => dc)
                .sort((a, b) => data[`${b.shortName}_invalid_values`]?.filter(values => values !== '"__VALID__"' && values !== "__VALID__")?.length -
                    data[`${a.shortName}_invalid_values`]?.filter(values => values !== '"__VALID__"' && values !== "__VALID__")?.length)
        ], c => c.name)
            .map(c => ({
                ...c,
                show: true,
                externalFilter: searchParams.get(c.name)?.split(filterValueDelimiter)?.filter(d => d.length)
            })),
        sourceInfo: {
            app,
            type: `${doc_type}-${view_id}-invalid-entry`,
            doc_type: `${doc_type}-${view_id}-invalid-entry`,

            env: `${app}+${doc_type}-${view_id}-invalid-entry`,
            isDms: true,
            originalDocType: `${doc_type}-invalid-entry`,
            view_id: view_id,
            columns
        },
        display: {
            usePagination: false,
            pageSize: 100,
            loadMoreId: `id-validate-page`,
            usePageFilters: true,
            allowDownload: true,
            hideDatasourceSelector: true
        },
    }
    return res;
}

const updateCall = async ({column, app, type, maps, falcor, user, setUpdating, setLoadingAfterUpdate}) => {
    setUpdating(true);
    await falcor.call(["dms", "data", "massedit"], [app, type, column.name, maps, user.id]);
    await falcor.invalidate(['uda', `${app}+${type}`])
    setUpdating(false);
    setLoadingAfterUpdate(true);
}

const RenderMassUpdater = ({sourceInfo, open, setOpen, falcor, columns, data, user, updating, setUpdating, cms_context}) => {
    if(!open) return;
    const {UI} = useContext(cms_context);
    const {Icon} = UI;
    const [maps, setMaps] = useState([]);
    const [loadingAfterUpdate, setLoadingAfterUpdate] = useState(false);
    const currColumn = columns.find(col => col.name === open);
    const {app, type} = sourceInfo;
    const Comp = useMemo(() => dataTypes[currColumn.type]?.EditComp || dataTypes.text.EditComp, [currColumn.type]);

    const invalidValues = useMemo(() => data[`${currColumn.shortName}_invalid_values`], [data, currColumn.shortName]);
    const uniqueInvalidValues = useMemo(() => uniq(
            invalidValues.map(val => (Array.isArray(val) ? JSON.stringify(val) : val))
        ).filter(values => {
            // filter out valid values. sql isn't doing that for multiselect
            return values !== '"__VALID__"' && values !== "__VALID__"
        }).map(val => {
            const invalidValue = val && val.startsWith("[") ? JSON.parse(val) : val;
            const count = data[`${currColumn.shortName}_invalid_values`].filter(val => isEqual(val, invalidValue)).length
            return {invalidValue, count}
        }).sort((a,b) => b.count - a.count),
        [invalidValues]);

    return (
        <div className={'fixed inset-0 h-full w-full z-[100] content-center'} style={{backgroundColor: '#00000066'}} onClick={() => setOpen(false)}>
            <div className={'w-3/4 h-1/2 overflow-auto scrollbar-sm flex flex-col gap-[12px] p-[16px] bg-white place-self-center rounded-md'} onClick={e => e.stopPropagation()}>
                <div className={'w-full flex justify-end'}>
                    <div className={'w-fit h-fit p-[8px] text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer'}
                         onClick={() => setOpen(false)}
                    >
                        <Icon icon={'XMark'} height={16} width={16}/>
                    </div>
                </div>

                <div className={'text-lg'}>{currColumn.display_name || currColumn.name}</div>

                <div className={'max-h-3/4 overflow-auto scrollbar-sm border rounded-md p-4'}>
                    <div className={'grid grid-cols-3'}>
                        <div>Invalid Values</div>
                        <div>Valid Values</div>
                        <div></div>
                    </div>
                    {
                        uniqueInvalidValues
                            .map(({invalidValue}, i) => {
                                const value = maps.find(map => isEqual(map.invalidValue, invalidValue))?.validValue;
                                return (
                                    <div key={invalidValue}
                                         className={`group grid grid-cols-3 items-center gap-y-1 ${i % 2 ? 'bg-gray-50' : ''} rounded-md `}>
                                        <div>
                                            {
                                                Array.isArray(invalidValue) ? invalidValue.join(', ') :
                                                    typeof invalidValue === 'object' ? JSON.stringify(invalidValue) : invalidValue}
                                            <span className={'mx-1 px-1 py-0.5 text-sm bg-red-50 text-red-500'}>
                                                {data[`${currColumn.shortName}_invalid_values`].filter(val => isEqual(val, invalidValue)).length}
                                            </span>
                                        </div>
                                        <div>
                                            <Comp
                                                className={'px-2 py-1'}
                                                value={value}
                                                options={currColumn.options}
                                                onChange={value => {
                                                    const validValue = Array.isArray(value) ? value.map(v => v?.value || v) : (value?.value || value);
                                                    const existingMap = maps.find(map => isEqual(map.invalidValue, invalidValue));

                                                    if (existingMap) {
                                                        const tmpMap =
                                                            maps.map(map =>
                                                                isEqual(map.invalidValue, invalidValue) ?
                                                                    {
                                                                        invalidValue, validValue: validValue
                                                                    } : map
                                                            )
                                                        setMaps(tmpMap)
                                                    } else {
                                                        setMaps([...maps, {
                                                            invalidValue,
                                                            validValue: validValue?.value || validValue
                                                        }])
                                                    }
                                                }}/>
                                        </div>
                                        <button
                                            onClick={() => setMaps(maps.filter(map => map.invalidValue !== invalidValue))}>reset
                                        </button>
                                    </div>
                                )
                            })
                    }
                </div>
                <button className={'px-2 py-1 bg-blue-500/15 text-blue-700 hover:bg-blue-500/25'}
                        onClick={() => updateCall({column: currColumn, app, type, maps, falcor, user, updating, setUpdating, setOpen, setLoadingAfterUpdate})}>
                    {updating ? 'updating...' : loadingAfterUpdate ? 'loading updates...' : 'update'}</button>
            </div>
        </div>
    )
}
const Edit = ({
    API_HOST, pageBaseUrl, user, falcor, item,
    apiLoad, apiUpdate, cms_context
              }) => {
    const navigate = useNavigate();
    const [data, setData] = useState({});
    const [lengths, setLengths] = useState({});
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState();
    const [massUpdateColumn, setMassUpdateColumn] = useState(); // column name that's getting mass updated
    const [updating, setUpdating] = useState(false);
    const [ssKey, setSSKey] = useState(''); // key for the spreadsheet component. need to change it on page changes.
    const [searchParams] = useSearchParams();
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const {app, doc_type, config, default_columns, view_id, source_id, views} = item;
    const columns = (JSON.parse(config || '{}')?.attributes || []).filter(col => col.type !== 'calculated').map((col, i) => ({...col, shortName: `col_${i}`}));
    console.log('columns in validate', {app, doc_type, config, default_columns, view_id, source_id});
    const [value, setValue] = useImmer(getInitState({columns, default_columns, app, doc_type, data, searchParams, view_id}));
    const validEntriesFormat = {
        app,
        type: `${doc_type}-${view_id}`,
        doc_type: `${doc_type}-${view_id}`,
        env: `${app}+${doc_type}-${view_id}`,
        isDms: true,
        originalDocType: `${doc_type}`,
        view_id: view_id,
    }

    useEffect(() => {
        if(!view_id && views?.length){
            const recentView = Math.max(...views.map(({id}) => id));
            navigate(`${pageBaseUrl}/${source_id}/validate/${recentView}`)
        }
    }, [views]);

    useEffect(() => {
        if(!view_id || updating || validating) return;
        let isStale = false;
        async function load(){
            setLoading(true)
            const filterFromUrl = getFilterFromSearchParams(searchParams);

            const multiselectFilterValueSets = {};
            for (const columnName of searchParams.keys()) {
                const { name, display, meta, type } = getFullColumn(columnName, columns);
                const isCalculatedColumn = isCalculatedCol(getFullColumn(columnName, columns));
                const refName = attributeAccessorStr(columnName, true, isCalculatedColumn);
                const fullColumn = { name, display, meta, refName, type };
                const reqName = getColAccessor({ ...fullColumn, fn: undefined }, true);

                if (type === 'multiselect') {
                    const invalidEntriesOptions = await getFilterData({
                        reqName,
                        refName,
                        allAttributes: [{ name, display, meta }],
                        apiLoad,
                        format: value.sourceInfo // invalid entries
                    });

                    const validEntriesOptions = await getFilterData({
                        reqName,
                        refName,
                        allAttributes: [{ name, display, meta }],
                        apiLoad,
                        format: validEntriesFormat
                    });

                    const selectedValues = (filterFromUrl[columnName] || []).map(o => o?.value || o);
                    if (!selectedValues.length) continue;

                    try {
                        const matchedOptions = uniq([...invalidEntriesOptions, ...validEntriesOptions])
                            .map(row => {
                                const option = row[reqName];
                                const parsedOption = isJson(option) && Array.isArray(JSON.parse(option)) ? JSON.parse(option) : [];
                                return parsedOption.find(o => selectedValues.includes(o)) ? option : null;
                            })
                            .filter(option => option);

                        multiselectFilterValueSets[columnName] = matchedOptions;
                    } catch (e) {
                        console.error('Could not load options for', columnName, e);
                    }
                }
            }
            const filter = Object.keys(filterFromUrl)
                .filter(columnName => multiselectFilterValueSets[columnName]?.length || filterFromUrl[columnName]?.length)
                .reduce((acc, columnName) => ({...acc, [`data->>'${columnName}'`]: multiselectFilterValueSets[columnName] || filterFromUrl[columnName] }), {})

            // ==================================== get # invalid rows begin ===========================================
            console.log('value.sourceinfo', value.sourceInfo)
            const invalidLength = await apiLoad({
                format: value.sourceInfo,
                children: [{
                    type: () => {},
                    action: 'udaLength',
                    path: '/',
                    filter: {
                        options: JSON.stringify({filter}),
                        stopFullDataLoad: true
                    },
                }]
            });
            const validLength = await apiLoad({
                format: validEntriesFormat,
                children: [{
                    type: () => {},
                    action: 'udaLength',
                    path: '/',
                    filter: {
                        options: JSON.stringify({filter}),
                        stopFullDataLoad: true
                    },
                }]
            });
            setLengths({validLength, invalidLength});
            // ==================================== get # invalid rows end =============================================
            const attrToFetch = columns
                .reduce((acc, col) => [
                    ...acc,
                    ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') &&
                    getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes'),

                    ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') &&
                    getInvalidValuesSql(col.name, col.shortName, col.options, col.required === 'yes', col.type),
                ], []).filter(f => f)

            if(isStale) return;
            console.time('getData')
            const data = await apiLoad({
                format: value.sourceInfo,
                attributes: attrToFetch,
                children: [{
                    type: () => {},
                    action: 'uda',
                    path: '/',
                    filter: {
                        fromIndex: () => 0,
                        toIndex: () => 0,
                        options: JSON.stringify({orderBy: {1: 'asc'}}),
                        attributes: attrToFetch,
                        stopFullDataLoad: true
                    },
                }]
            });
            console.timeEnd('getData')

            console.time('setData')
            if(isStale) return;
            const mappedData = columns
                .filter(col => ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes'))
                .reduce((acc, col) => {
                    const invalidValues = data?.[0]?.[getInvalidValuesSql(col.name, col.shortName, col.options, col.required === 'yes', col.type)]?.value;
                    const sanitisedValues =
                        Array.isArray(invalidValues) ? // for multiselects
                            invalidValues.filter(inv => {
                                const value = inv?.value || inv;
                                return ['select', 'multiselect', 'radio'].includes(col.type) && col.options ? (
                                    Array.isArray(value) ?
                                        value.reduce((acc, v) => {
                                            return acc || !col.options.some(o => (o?.value || o) === (v?.value || v)) && v !== '"__VALID__"' && v !== "__VALID__"
                                        }, false) : // make sure all selections are valid
                                        !col.options.find(o => (o?.value || o) === value) && value !== '"__VALID__"' && value !== "__VALID__"
                                ) : inv !== '"__VALID__"' && inv !== "__VALID__"
                            }).map(value => Array.isArray(value) ? value.map(v => v?.value || v) : (value?.value || value)) : invalidValues

                    // console.log('===', col.name, invalidValues, sanitisedValues)
                    return {
                        ...acc,
                        [`${col.shortName}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes')],
                        [`${col.shortName}_invalid_values`]: sanitisedValues,
                    }
                }, {});

            setData(mappedData);
            setValue(getInitState({columns, default_columns, state: value, app, doc_type, view_id, data: mappedData, searchParams}))
            setSSKey(`${Date.now()}`);
            setLoading(false);
            setMassUpdateColumn(undefined);
            console.timeEnd('setData')
        }

        load()

        return () => {
            isStale = true;
        }
    }, [app, doc_type, config, default_columns?.length, view_id, source_id, searchParams, updating, validating])

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')
    SpreadSheetCompWithControls.controls.header = {
        displayFn: column => {
            const invalidValues = data[`${column.shortName}_invalid_values`]?.filter(values => values !== '"__VALID__"' && values !== "__VALID__") || [];
            const isFilterOn = (value?.columns || []).find(col => col.name === column.name)?.filters?.length;

            if(!invalidValues?.length){
                return (
                    <span className={'truncate select-none'}
                          title={column.customName || column.display_name || column.name}>
                                    {column.customName || column.display_name || column.name}
                    </span>
                )
            }

            return (
                <>
                    <span className={'truncate select-none min-w-[15px]'}
                          title={column.customName || column.display_name || column.name}>
                                    {column.customName || column.display_name || column.name}
                    </span>

                    <span className={'flex ml-1 gap-0.5 font-light'}>
                        <span className={'flex px-1 py-0.5 text-xs bg-red-50 text-red-500 rounded-sm'}
                              onClick={e => {
                                  e.stopPropagation();
                                  setMassUpdateColumn(column.name)
                              }}>
                            {invalidValues.length}
                        </span>

                        <span
                            className={'flex place-items-center px-1 py-0.5 text-sm bg-blue-50 rounded-sm'}
                            onClick={e => {
                                e.stopPropagation();

                                const tmpValue = cloneDeep(value);
                                const idx = tmpValue.columns.findIndex(col => col.name === column.name);
                                if (idx === -1) return;

                                // reshape the multiselect data to an array.
                                const filterValues =
                                    invalidValues.reduce((acc, curr) => Array.isArray(curr) ? [...acc, ...curr] : [...acc, curr], []).map(o => o === null ? 'null' : o);

                                tmpValue.columns[idx].filters = isFilterOn ? undefined : [{
                                    type: 'external',
                                    operation: 'filter',
                                    isMulti: true,
                                    values: uniq(filterValues)
                                }]

                                tmpValue.dataRequest = {filter: {[column.name]: uniq(filterValues)}};
                                setValue((tmpValue))
                                setSSKey(`${Date.now()}`);
                            }}>
                            {isFilterOn ? <FilterRemove className={'text-blue-500'} height={14} width={14} /> : <Filter className={'text-blue-500'} height={14} width={14} />}
                        </span>
                    </span>
                </>
            )
        }
    }
    return (
            <div
                className={'flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                <div className='w-full max-w-6xl mx-auto'>
                    <div
                        className={'flex justify-between w-full'}>
                        {/* stat boxes */}
                        <div className={'flex gap-2 text-gray-500'}>
                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Total Rows: <span className={'text-gray-900'}>{(lengths.validLength || 0) + (lengths.invalidLength || 0)}</span></div>
                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Invalid Rows: <span className={'text-gray-900'}>{(lengths.invalidLength || 0)}</span></div>
                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Valid Rows: <span className={'text-gray-900'}>{(lengths.validLength || 0)}</span></div>
                        </div>
                        <button
                            className={`px-2 py-1 text-sm ${error ? `bg-red-300 hover:bg-red-600 text-white` : `bg-blue-500/15 text-blue-700 hover:bg-blue-500/25`} rounded-md`}
                            onClick={() =>
                                reValidate({
                                    app, type: value.sourceInfo.type,
                                    parentDocType: doc_type, dmsServerPath, setValidating, setError, falcor
                                })}
                        >
                            {error ? JSON.stringify(error) : validating ? 'Validating' : 'Re - Validate'}
                        </button>
                    </div>

                    {/* Mass Update Modal */}
                    <RenderMassUpdater open={massUpdateColumn}
                                       setOpen={setMassUpdateColumn}
                                       columns={columns}
                                       apiUpdate={apiUpdate}
                                       data={data}
                                       sourceInfo={value.sourceInfo}
                                       falcor={falcor}
                                       user={user}
                                       updating={updating}
                                       setUpdating={setUpdating}
                                       cms_context={cms_context}
                    />

                    {/* invalid rows */}
                    {
                        columns.find(col => data[`${col.shortName}_error`]) || loading ?
                            <div
                                className={'w-full flex items-center justify-between px-2 py-1 text-gray-500 bg-gray-100 rounded-md my-2'}>
                                {loading ? 'loading' : ''} Invalid Rows
                            </div> : null
                    }
                    {
                        !columns.find(col => data[`${col.shortName}_error`]) || loading ? null :
                            <ComponentContext.Provider value={{
                                state: value, setState: setValue, apiLoad,
                                compType: SpreadSheetCompWithControls.name.toLowerCase(), // should be deprecated
                                controls: SpreadSheetCompWithControls.controls,
                                app
                            }}>
                                <Controls context={ComponentContext} cms_context={cms_context}/>
                                <RenderFilters state={value} setState={setValue} apiLoad={apiLoad} isEdit={true} defaultOpen={true} cms_context={cms_context} />
                                <DataWrapper.EditComp
                                    cms_context={cms_context}
                                    component={SpreadSheetCompWithControls}
                                    key={ssKey}
                                    value={value}
                                    hideSourceSelector={true}
                                    size={1}
                                    apiUpdate={apiUpdate}
                                    // onChange={() => {console.log('on change called')}}
                                />
                            </ComponentContext.Provider>
                    }
                </div>
            </div>
    )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Validate',
    "type": 'Validate',
    "variables": [],
    "EditComp": Edit,
    "ViewComp": Edit
}