import React, {useContext, useEffect, useMemo, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../components/selector/ComponentRegistry/spreadsheet";

const getBlankValueSql = (fullName, shortName) => `SUM(CASE WHEN data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '' THEN 1 ELSE 0 END) AS ${shortName}_blank`;
const getFilledValueSql = (fullName, shortName) => `SUM(CASE WHEN data->>'${fullName}' IS NOT NULL AND data->>'${fullName}'::text != '' THEN 1 ELSE 0 END) AS ${shortName}_value`;
const getErrorValueSql = (fullName, shortName, options, required) =>
    `SUM(CASE ${required ? `WHEN (data->>'${fullName}' IS NULL OR data->>'${fullName}'::text = '') THEN 1` : ``}
              ${options?.length ? `WHEN data->>'${fullName}' NOT IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1` : ``} ELSE 0 END) AS ${shortName}_error`;
const getValidValueSql = (fullName, shortName, options, required) =>
    `SUM(CASE ${required ? `WHEN (data->>'${fullName}' IS NOT NULL ANd data->>'${fullName}'::text != '') THEN 1` : ``}
              ${options?.length ? `WHEN data->>'${fullName}' IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1` : ``} ELSE 0 END) AS ${shortName}_valid`;

const formatNum = (isLoading, value='') => isLoading ? 'loading...' : value.toString().toLocaleString();

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
        console.log('--------------------res', publishFinalEvent)
        setValidating(false)
        window.location = window.location;
    }catch (e){
        setValidating(false);
        setError(e)
    }
}

const Validate = ({
    adminPath,
    status,
    apiUpdate,
    apiLoad,
    attributes={},
    dataItems,
    // format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    // parent,
    manageTemplates = false,
    // ...rest
}) => {
    // assumes meta is already setup. if a user changes meta after upload, validation is incomplete.
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState();
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const {app, doc_type, config} = item;
    const columns = (JSON.parse(config || '{}')?.attributes || []).filter(col => col.type !== 'calculated').map((col, i) => ({...col, shortName: `col_${i}`}));
    const is_dirty = (JSON.parse(config || '{}')?.is_dirty);
    // make sure after upload, you can make corrections and re-validate.
    // validate correct records on meta change should be possible
    // valid entries on upload should also be checked as updated meta may make them invalid
    // const validEntriesFormat = {app, type: `${doc_type}-${params.view_id}`, doc_type: `${doc_type}-${params.view_id}`, config}
    const invalidEntriesFormat = {
        app,
        type: `${doc_type}-${params.view_id}-invalid-entry`,
        doc_type: `${doc_type}-${params.view_id}-invalid-entry`,
        config,

        env: `${item.app}+${doc_type}-${params.view_id}-invalid-entry`,
        isDms: true,
        originalDocType: `${doc_type}-invalid-entry`,
        view_id: params.view_id,

    }

    const ssProps = {
        sourceInfo: {
            app,
            type: `${doc_type}-${params.view_id}-invalid-entry`,
            doc_type: `${doc_type}-${params.view_id}-invalid-entry`,

            env: `${item.app}+${doc_type}-${params.view_id}-invalid-entry`,
            isDms: true,
            originalDocType: `${doc_type}-invalid-entry`,
            view_id: params.view_id,
            columns
        },
        display: {
            usePagination: false,
            pageSize: 10,
            loadMoreId: `id-validate-page`,
            allowSearchParams: false,
        },
        columns: columns.filter(col => data[`${col.shortName}_error`]).map(c => ({...c, show:true})),
    }

    useEffect(() => {
        async function load(){
            setLoading(true)
            const attrToFetch = columns.reduce((acc, col) => [
                ...acc,
                getBlankValueSql(col.name, col.shortName),
                getFilledValueSql(col.name, col.shortName),
                ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes'),
                ((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && getValidValueSql(col.name, col.shortName, col.options, col.required === 'yes'),
            ], []).filter(f => f)
            // console.log('attrs to fetch', attrToFetch)
            const children = [{
                type: () => {
                },
                action: 'uda',
                path: '/',
                filter: {
                    fromIndex: 0,
                    toIndex: 0,
                    options: JSON.stringify({aggregatedLen: true, filter: {}, orderBy: {1: 'asc'}}),
                    attributes: attrToFetch,
                    stopFullDataLoad: true
                },
            }]
            console.time('getData')
            const data = await apiLoad({
                // app: invalidEntriesFormat.app,
                // type: invalidEntriesFormat.type,
                format: invalidEntriesFormat,
                attributes: attrToFetch,
                children
            });
            console.timeEnd('getData')

            console.time('setData')
            const mappedData = columns.reduce((acc, col) => ({
                ...acc,
                [`${col.name}_blank`]: +data?.[0]?.[getBlankValueSql(col.name, col.shortName)],
                [`${col.name}_filled`]: +data?.[0]?.[getFilledValueSql(col.name, col.shortName)],
                ...((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.shortName}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes')]},
                ...((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.shortName}_valid`]: +data?.[0]?.[getValidValueSql(col.name, col.shortName, col.options, col.required === 'yes')]},
            }), {});
            // console.log('data', data, mappedData)
            setData(mappedData);
            setLoading(false);
            console.timeEnd('setData')
        }

        load()
    }, [item])
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
                                        className={'flex justify-between w-full p-2 font-semibold bg-gray-100 rounded-md my-1'}>
                                        {
                                            columns.find(col => data[`${col.shortName}_error`]) || loading ? 'Columns with errors' : 'All records are valid.'
                                        }
                                        <button
                                            className={`p-1 text-sm text-white ${error ? `bg-red-300 hover:bg-red-600` : `bg-blue-300 hover:bg-blue-600`} rounded-md`}
                                            onClick={() =>
                                                reValidate({
                                                    app,
                                                    type: invalidEntriesFormat.type,
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

                                    <div className={'grid grid-cols-2 gap-1'}>
                                        {
                                            columns
                                                .filter(col => data[`${col.shortName}_error`])
                                                .map(col => (
                                                    <div
                                                        className={'p-2 flex flex-col hover:bg-blue-100 transition:ease-in-out border rounded-md'}
                                                        style={{gridTemplateColumns: '2fr 1fr 1fr'}}>
                                                        <div
                                                            className={'font-semibold'}>{col.display_name || col.name}</div>
                                                        <div className={'grid grid-cols-1 sm:grid-cols-2 divide-x-2'}>
                                                            <div className={'flex flex-col px-1'}>
                                                                <div># rows with
                                                                    value: {formatNum(loading, data[`${col.shortName}_filled`])}</div>
                                                                <div># rows without
                                                                    value: {formatNum(loading, data[`${col.shortName}_blank`])}</div>
                                                                <div>total: {formatNum(loading, data[`${col.shortName}_blank`] + data[`${col.shortName}_filled`])}</div>
                                                            </div>
                                                            <div className={'flex flex-col px-1'}>
                                                                <div># rows with
                                                                    errors: {formatNum(loading, data[`${col.shortName}_error`])}</div>
                                                                <div># rows with
                                                                    valid: {formatNum(loading, data[`${col.shortName}_valid`])}</div>
                                                                <div>total: {formatNum(loading, data[`${col.shortName}_error`] + data[`${col.shortName}_valid`])}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                        }
                                    </div>

                                    {/* invalid rows */}
                                    {
                                        columns.find(col => data[`${col.shortName}_error`]) || loading ?
                                            <div
                                                className={'w-full flex items-center justify-between p-2 font-semibold bg-gray-100 rounded-md my-1'}>
                                                Invalid Rows
                                            </div> : null
                                    }
                                    {
                                        !columns.find(col => data[`${col.shortName}_error`]) || loading ? null :
                                            <Spreadsheet.EditComp
                                                onChange={() => {
                                                }}
                                                size={1}
                                                format={ssProps}
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