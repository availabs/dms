import React, {useEffect, useState} from "react";
import Layout from '../ui/avail-layout'
import { FormsContext } from '../'
import {getValues} from "../../../data-types/form-config/components/RenderField";
import {attributeAccessorStr, formattedAttributeStr} from "../components/selector/ComponentRegistry/spreadsheet/utils";

const getBlankValueSql = col => `SUM(CASE WHEN data->>'${col}' IS NULL OR data->>'${col}'::text = '' THEN 1 ELSE 0 END) AS ${col}_blank`;
const getFilledValueSql = col => `SUM(CASE WHEN data->>'${col}' IS NOT NULL AND data->>'${col}'::text != '' THEN 1 ELSE 0 END) AS ${col}_value`;
const getErrorValueSql = (col, options) =>
    `SUM(CASE WHEN (data->>'${col}' IS NOT NULL ANd data->>'${col}'::text != '') AND data->>'${col}' NOT IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1 ELSE 0 END) AS ${col}_error`;
const getValidValueSql = (col, options) =>
    `SUM(CASE WHEN data->>'${col}' IN (${options.map(o => `'${(o.value || o).replace(/'/, "''")}'`)}) THEN 1 ELSE 0 END) AS ${col}_valid`;

const formatNum = (isLoading, value='') => isLoading ? 'loading...' : value.toString().toLocaleString();
export const Validate = ({
    adminPath,
    status,
    apiUpdate,
    apiLoad,
    attributes={},
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    parent,
    manageTemplates = false,
    ...rest
}) => {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const { baseUrl, theme, user } = React.useContext(FormsContext) || {};
    const {app, type, config} = parent;
    const columns = JSON.parse(config)?.attributes || [];
    console.log('Validate', parent, columns)

    useEffect(() => {
        async function load(){
            setLoading(true)
            const attrToFetch = columns.reduce((acc, col) => [
                ...acc,
                getBlankValueSql(col.name),
                getFilledValueSql(col.name),
                ['select', 'multiselect'].includes(col.type) && col.options?.length && getErrorValueSql(col.name, col.options),
                ['select', 'multiselect'].includes(col.type) && col.options?.length && getValidValueSql(col.name, col.options),
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
                app: format.app,
                type: format.type,
                format,
                attributes: attrToFetch,
                children
            });
            console.timeEnd('getData')

            console.time('setData')
            const mappedData = columns.reduce((acc, col) => ({
                ...acc,
                [`${col.name}_blank`]: +data?.[0]?.[getBlankValueSql(col.name)],
                [`${col.name}_filled`]: +data?.[0]?.[getFilledValueSql(col.name)],
                ...['select', 'multiselect'].includes(col.type) && col.options?.length && {[`${col.name}_error`]: +data?.[0]?.[getErrorValueSql(col.name, col.options)]},
                ...['select', 'multiselect'].includes(col.type) && col.options?.length && {[`${col.name}_valid`]: +data?.[0]?.[getValidValueSql(col.name, col.options)]},
            }), {});

            setData(mappedData);
            setLoading(false);
            console.timeEnd('setData')
        }

        load()
    }, [parent])
    return (
        <Layout adminPath={adminPath}>
            <div className={`${theme?.page?.wrapper1}`}>
                <div className={`${theme?.page?.wrapper2}`}>      
                    <div className={theme?.page?.wrapper3}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className='w-full max-w-6xl mx-auto'>
                            {
                                columns.map(col => (
                                    <div
                                        className={'p-4 grid grid-cols-3 justify-between hover:bg-blue-300 transition:ease-in-out'}
                                        style={{gridTemplateColumns: '2fr 1fr 1fr'}}>
                                        <div>{col.display_name || col.name}</div>
                                        <div className={'flex flex-col'}>
                                            <div># rows with value: {formatNum(loading, data[`${col.name}_filled`])}</div>
                                            <div># rows without value: {formatNum(loading, data[`${col.name}_blank`])}</div>
                                            <div>total: {formatNum(loading, data[`${col.name}_blank`] + data[`${col.name}_filled`])}</div>
                                        </div>
                                        <div className={'flex flex-col'}>
                                            <div># rows with errors: {formatNum(loading, data[`${col.name}_error`])}</div>
                                            <div># rows with valid: {formatNum(loading, data[`${col.name}_valid`])}</div>
                                            <div>total: {formatNum(loading, data[`${col.name}_error`] + data[`${col.name}_valid`])}</div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
}

