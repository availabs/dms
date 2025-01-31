import React, {memo, useContext, useEffect, useMemo, useState} from "react";
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

const getInitState = ({columns, app, doc_type, params, data}) => JSON.stringify({
    dataRequest: {},
    data: [],
    columns: columns.filter(({defaultShow, shortName}) => defaultShow || data[`${shortName}_error`]).map(c => ({...c, show: true})),
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
        pageSize: 1000,
        loadMoreId: `id-validate-page`,
        allowSearchParams: false,
    },
})
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
    const [lengths, setLengths] = useState({});
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState();
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const {app, doc_type, config} = item;
    const columns = (JSON.parse(config || '{}')?.attributes || []).filter(col => col.type !== 'calculated').map((col, i) => ({...col, shortName: `col_${i}`}));
    const is_dirty = (JSON.parse(config || '{}')?.is_dirty);

    const [value, setValue] = useState(getInitState({columns, app, doc_type, params, data}));
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
        async function load(){
            setLoading(true)

            // ==================================== get # invalid rows begin ===========================================
            const invalidLength = await apiLoad({
                format: JSON.parse(value).sourceInfo,
                children: [{
                    type: () => {},
                    action: 'udaLength',
                    path: '/',
                    filter: {
                        options: JSON.stringify({}),
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
                        options: JSON.stringify({}),
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
            console.log('validation columns',
                columns.filter(({type, options, required}) => (['select', 'multiselect', 'radio'].includes(type) && options?.length) || required === 'yes').length,
                attrToFetch.length
            )


            console.time('getData')
            const data = await apiLoad({
                format: JSON.parse(value).sourceInfo,
                attributes: attrToFetch,
                children: [{
                    type: () => {},
                    action: 'uda',
                    path: '/',
                    filter: {
                        fromIndex: 0,
                        toIndex: 0,
                        options: JSON.stringify({orderBy: {1: 'asc'}}),
                        attributes: attrToFetch,
                        stopFullDataLoad: true
                    },
                }]
            });
            console.timeEnd('getData')

            console.time('setData')
            const mappedData = columns.reduce((acc, col) => ({
                ...acc,
                ...((['select', 'multiselect', 'radio'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.shortName}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.shortName, col.options, col.required === 'yes')]},
            }), {});
            // console.log('data', data, mappedData)
            setData(mappedData);
            setValue(getInitState({columns, app, doc_type, params, data: mappedData}))
            setLoading(false);
            console.timeEnd('setData')
        }

        load()
    }, [item])

    const page = useMemo(() => ({name: 'Validate', href: `${pageBaseUrl}/${params.id}/validate`, /*warn: is_dirty*/}), [is_dirty, pageBaseUrl, params.id])

    const RenderSS = memo(({value}) => <Spreadsheet.EditComp
        key={'validate-page-spreadsheet'}
        value={value}
        onChange={(stringValue) => {setValue(stringValue)}}
        hideSourceSelector={true}
        size={1}
        apiLoad={apiLoad}
        apiUpdate={apiUpdate}
    />)

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
                                                Invalid Rows
                                            </div> : null
                                    }
                                    {
                                        !columns.find(col => data[`${col.shortName}_error`]) || loading ? null :
                                            <RenderSS value={value} />
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