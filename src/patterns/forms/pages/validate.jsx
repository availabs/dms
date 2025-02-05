import React, {useEffect, useMemo, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import Spreadsheet from "../../page/ui/dataComponents/selector/ComponentRegistry/spreadsheet";
import {useNavigate, useSearchParams} from "react-router-dom";
import {getData as getFilterData} from "../../page/ui/dataComponents/selector/ComponentRegistry/shared/filters/utils";
import {applyFn, attributeAccessorStr, isJson} from "../../page/ui/dataComponents/selector/ComponentRegistry/spreadsheet/utils/utils";
import {uniq} from "lodash-es";

const getErrorValueSql = (fullName, shortName, options, required) =>
    `SUM(CASE ${required ? `WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN 1` : ``}
              ${options?.length ? `WHEN data->>'${fullName}' NOT IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1` : ``} ELSE 0 END) AS ${shortName}_error`;
const getFullColumn = (columnName, columns) => columns.find(col => col.name === columnName);
const getColAccessor = (col, isDms) => !col ? null : applyFn(col, isDms);
const isCalculatedCol = ({display, type, origin}) => {
    return display === 'calculated' || type === 'calculated' || origin === 'calculated-column'
};
const filterValueDelimiter = '|||';

const reValidate = async ({app, type, parentId, parentDocType, dmsServerPath, setValidating, setError}) => {
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

        const publishFinalEvent = await res.json();
        setValidating(false)
        window.location = window.location;
    }catch (e){
        setValidating(false);
        setError(e)
    }
}
const getFilterFromSearchParams = searchParams => Array.from(searchParams.keys()).reduce((acc, column) => ({
    ...acc,
    [column]: searchParams.get(column)?.split(filterValueDelimiter)?.filter(d => d.length),
}), {});

const getInitState = ({columns, defaultColumns=[], app, doc_type, params, data, searchParams}) => JSON.stringify({
    dataRequest: {filter: getFilterFromSearchParams(searchParams)},
    data: [],
    columns: [
        ...defaultColumns.filter(dc => columns.find(c => c.name === dc.name)), // default columns
        ...columns.filter(({name, shortName}) => !defaultColumns.find(dc => dc.name === name) && data[`${shortName}_error`]) // error columns minus default columns
    ]
        .map(c => ({...c, show: true, externalFilter: searchParams.get(c.name)?.split(filterValueDelimiter)?.filter(d => d.length)})),
    sourceInfo: {
        app,
        type: `${doc_type}-${params.view_id}-invalid-entry`,
        doc_type: `${doc_type}-${params.view_id}-invalid-entry`,

        env: `${app}+${doc_type}-${params.view_id}-invalid-entry`,
        isDms: true,
        originalDocType: `${doc_type}-invalid-entry`,
        view_id: params.view_id,
        columns
    },
    display: {
        usePagination: false,
        pageSize: 100,
        loadMoreId: `id-validate-page`,
        allowSearchParams: true,
    },
})
const Validate = ({status, apiUpdate, apiLoad, item, params}) => {
    // assumes meta is already setup. if a user changes meta after upload, validation is incomplete.
    const navigate = useNavigate();
    const [data, setData] = useState({});
    const [lengths, setLengths] = useState({});
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState();
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    const [searchParams] = useSearchParams();
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const {app, doc_type, config, defaultColumns} = item;
    const columns = (JSON.parse(config || '{}')?.attributes || []).filter(col => col.type !== 'calculated').map((col, i) => ({...col, shortName: `col_${i}`}));
    const is_dirty = (JSON.parse(config || '{}')?.is_dirty);

    const [value, setValue] = useState(getInitState({columns, defaultColumns, app, doc_type, params, data, searchParams}));
    const validEntriesFormat = {
        app,
        type: `${doc_type}-${params.view_id}`,
        doc_type: `${doc_type}-${params.view_id}`,
        env: `${item.app}+${doc_type}-${params.view_id}`,
        isDms: true,
        originalDocType: `${doc_type}`,
        view_id: params.view_id,
    }

    useEffect(() => {
        if(!params.view_id && item?.views?.length){
            const recentView = Math.max(...item.views.map(({id}) => id));
            navigate(`${pageBaseUrl}/${params.id}/validate/${recentView}`)
        }
    }, [item.views]);

    useEffect(() => {
        if(!params.view_id) return;
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
                        format: JSON.parse(value).sourceInfo // invalid entries
                    });

                    const validEntriesOptions = await getFilterData({
                        reqName,
                        refName,
                        allAttributes: [{ name, display, meta }],
                        apiLoad,
                        format: validEntriesFormat
                    });

                    const selectedValues = (filterFromUrl[columnName] || []).map(o => o.value || o);
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
            const invalidLength = await apiLoad({
                format: JSON.parse(value).sourceInfo,
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
                ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes')
            ], []).filter(f => f)

            if(isStale) return;
            console.time('getData')
            const data = await apiLoad({
                format: JSON.parse(value).sourceInfo,
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
            const mappedData = columns.reduce((acc, col) => ({
                ...acc,
                ...((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.shortName}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes')]},
            }), {});

            setData(mappedData);
            setValue(getInitState({columns, defaultColumns, app, doc_type, params, data: mappedData, searchParams}))
            setLoading(false);
            console.timeEnd('setData')
        }

        load()

        return () => {
            isStale = true;
        }
    }, [item, searchParams])

    const page = useMemo(() => ({name: 'Validate', href: `${pageBaseUrl}/${params.id}/validate`, /*warn: is_dirty*/}), [is_dirty, pageBaseUrl, params.id])

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: item.url_slug}}
                       page={page}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={item.views}
                       showVersionSelector={true}

        >
            <div className={`${theme?.page?.wrapper1}`}>
                {
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                        <div>
                            <div
                                className={'flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                                {status ? <div>{JSON.stringify(status)}</div> : ''}
                                {/* stat boxes */}
                                <div className='w-full max-w-6xl mx-auto'>
                                    <div
                                        className={'flex justify-between w-full'}>
                                        <div className={'flex gap-2 text-gray-500'}>
                                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Total Rows: <span className={'text-gray-900'}>{(lengths.validLength || 0) + (lengths.invalidLength || 0)}</span></div>
                                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Invalid Rows: <span className={'text-gray-900'}>{(lengths.invalidLength || 0)}</span></div>
                                            <div className={'bg-gray-100 rounded-md px-2 py-1'}>Valid Rows: <span className={'text-gray-900'}>{(lengths.validLength || 0)}</span></div>
                                        </div>
                                        <button
                                            className={`p-1 text-sm text-white ${error ? `bg-red-300 hover:bg-red-600` : `bg-blue-300 hover:bg-blue-600`} rounded-md`}
                                            onClick={() =>
                                                reValidate({
                                                    app,
                                                    type: JSON.parse(value).sourceInfo.type,
                                                    // parentId: parent.id,
                                                    parentDocType: doc_type,
                                                    dmsServerPath,
                                                    setValidating,
                                                    setError
                                                })}
                                        >
                                            {error ? JSON.stringify(error) : validating ? 'Validating' : 'Re - Validate'}
                                        </button>
                                    </div>

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
                                            <Spreadsheet.EditComp
                                                key={'validate-page-spreadsheet'}
                                                value={value}
                                                onChange={(stringValue) => {setValue(stringValue)}}
                                                hideSourceSelector={true}
                                                size={1}
                                                apiLoad={apiLoad}
                                                apiUpdate={apiUpdate}
                                            />
                                    }
                                </div>
                            </div>
                        </div>
                }
            </div>
        </SourcesLayout>

    )
}

export default Validate