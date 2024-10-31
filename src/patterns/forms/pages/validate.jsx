import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../components/selector/ComponentRegistry/spreadsheet";

const getBlankValueSql = col => `SUM(CASE WHEN data->>'${col}' IS NULL OR data->>'${col}'::text = '' THEN 1 ELSE 0 END) AS ${col}_blank`;
const getFilledValueSql = col => `SUM(CASE WHEN data->>'${col}' IS NOT NULL AND data->>'${col}'::text != '' THEN 1 ELSE 0 END) AS ${col}_value`;
const getErrorValueSql = (col, options, required) =>
    `SUM(CASE ${required ? `WHEN (data->>'${col}' IS NULL OR data->>'${col}'::text = '') THEN 1` : ``}
              ${options?.length ? `WHEN (data->>'${col}' IS NOT NULL AND data->>'${col}'::text != '') AND data->>'${col}' NOT IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1` : ``} ELSE 0 END) AS ${col}_error`;
const getValidValueSql = (col, options, required) =>
    `SUM(CASE ${required ? `WHEN (data->>'${col}' IS NOT NULL ANd data->>'${col}'::text != '') THEN 1` : ``}
              ${options?.length ? `WHEN data->>'${col}' IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1` : ``} ELSE 0 END) AS ${col}_valid`;

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
    const columns = JSON.parse(config || '{}')?.attributes || [];
    const invalidEntriesFormat = {app, type: `${doc_type}-invalid-entry`, doc_type: `${doc_type}-invalid-entry`, config}
    console.log('?????//', invalidEntriesFormat, app, doc_type, config)
    useEffect(() => {
        async function load(){
            setLoading(true)
            const attrToFetch = columns.reduce((acc, col) => [
                ...acc,
                getBlankValueSql(col.name),
                getFilledValueSql(col.name),
                ((['select', 'multiselect'].includes(col.type) && col.options?.length) || col.required === 'yes') && getErrorValueSql(col.name, col.options, col.required === 'yes'),
                ((['select', 'multiselect'].includes(col.type) && col.options?.length) || col.required === 'yes') && getValidValueSql(col.name, col.options, col.required === 'yes'),
            ], []).filter(f => f)

            const children = [{
                type: () => {
                },
                action: 'load',
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
                app: invalidEntriesFormat.app,
                type: invalidEntriesFormat.type,
                format: invalidEntriesFormat,
                attributes: attrToFetch,
                children
            });
            console.timeEnd('getData')

            console.time('setData')
            const mappedData = columns.reduce((acc, col) => ({
                ...acc,
                [`${col.name}_blank`]: +data?.[0]?.[getBlankValueSql(col.name)],
                [`${col.name}_filled`]: +data?.[0]?.[getFilledValueSql(col.name)],
                ...((['select', 'multiselect'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.name}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.options, col.required === 'yes')]},
                ...((['select', 'multiselect'].includes(col.type) && col.options?.length) || col.required === 'yes') && {[`${col.name}_valid`]: +data?.[0]?.[getValidValueSql(col.name, col.options, col.required === 'yes')]},
            }), {});

            setData(mappedData);
            setLoading(false);
            console.timeEnd('setData')
        }

        load()
    }, [item])
    return (
        <SourcesLayout ffullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: item.url_slug}}
                       page={{name: 'Validate', href: `${pageBaseUrl}/${params.id}/validate`}}
                       id={params.id} //page id to use for navigation

        >
            <div className={`${theme?.page?.wrapper1}`}>
                <div>
                    <div className={'flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        {/* stat boxes */}
                        <div className='w-full max-w-6xl mx-auto'>
                            {
                                columns.find(col => data[`${col.name}_error`]) || loading ?
                                    <div className={'w-full p-2 font-semibold bg-gray-100 rounded-md my-1'}>Columns with errors</div> :
                                    <div className={'w-full p-2 font-semibold bg-gray-100 rounded-md'}>All records are valid.</div>
                            }
                            <div className={'grid grid-cols-2 gap-1'}>
                                {
                                    columns
                                        .filter(col => data[`${col.name}_error`])
                                        .map(col => (
                                            <div
                                                className={'p-2 flex flex-col hover:bg-blue-100 transition:ease-in-out border rounded-md'}
                                                style={{gridTemplateColumns: '2fr 1fr 1fr'}}>
                                                <div className={'font-semibold'}>{col.display_name || col.name}</div>
                                                <div className={'grid grid-cols-1 sm:grid-cols-2 divide-x-2'}>
                                                    <div className={'flex flex-col px-1'}>
                                                        <div># rows with
                                                            value: {formatNum(loading, data[`${col.name}_filled`])}</div>
                                                        <div># rows without
                                                            value: {formatNum(loading, data[`${col.name}_blank`])}</div>
                                                        <div>total: {formatNum(loading, data[`${col.name}_blank`] + data[`${col.name}_filled`])}</div>
                                                    </div>
                                                    <div className={'flex flex-col px-1'}>
                                                        <div># rows with
                                                            errors: {formatNum(loading, data[`${col.name}_error`])}</div>
                                                        <div># rows with
                                                            valid: {formatNum(loading, data[`${col.name}_valid`])}</div>
                                                        <div>total: {formatNum(loading, data[`${col.name}_error`] + data[`${col.name}_valid`])}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                }
                            </div>

                            {/* invalid rows */}
                            {
                                columns.find(col => data[`${col.name}_error`]) || loading ?
                                    <div className={'w-full flex items-center justify-between p-2 font-semibold bg-gray-100 rounded-md my-1'}>
                                        Invalid Rows
                                        <button className={`p-1 text-sm text-white ${error ? `bg-red-300 hover:bg-red-600` : `bg-blue-300 hover:bg-blue-600`} rounded-md float-right`}
                                                onClick={() =>
                                                    reValidate({
                                                        app,
                                                        type: invalidEntriesFormat.type,
                                                        parentId: parent.id,
                                                        parentDocType: parent.doc_type,
                                                        dmsServerPath,
                                                        setValidating,
                                                        setError
                                                    })}
                                        >
                                            {error ? JSON.stringify(error) : validating ? 'Validating' : 'Re - Validate'}
                                        </button>
                                    </div> : null
                            }
                            {
                                !columns.find(col => data[`${col.name}_error`]) || loading ? null :
                                    <Spreadsheet.EditComp
                                        onChange={() => {}}
                                        size={1}
                                        format={invalidEntriesFormat}
                                        apiLoad={apiLoad}
                                        apiUpdate={apiUpdate}
                                        value={JSON.stringify({
                                            allowEditInView: true,
                                            visibleAttributes: columns.filter(col => data[`${col.name}_error`]).map(col => col.name),
                                        })}
                                    />
                            }
                        </div>
                    </div>
                </div>
            </div>
        </SourcesLayout>

    )
}

export default Validate