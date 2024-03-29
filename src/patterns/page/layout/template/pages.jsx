import React, {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../api";
import {DeleteModal} from "./list.jsx";
import Layout from '../components/avail-layout'
import {Table} from "~/modules/avl-components/src";
import {getNestedValue} from "../../../forms/utils/getNestedValue";

export const locationNameMap = {
    'docs-play': 'Playground',
    'docs-page': 'Live',
    'docs-draft': 'Draft',
    'docs-ctp': 'CTP Live'
}


export const locationUrlMap = {
    'docs-play': '/playground',
    'docs-page': '',
    'docs-ctp': '',
    'docs-draft': '/drafts'
}

const NoPages = ({}) => (<div className={'p-4'}>No Pages have been generated for this template.</div>)

function TemplateRow ({ id, app, type, data={} }) {
    const navigate = useNavigate();
    const [showDelete, setShowDelete] = useState(false)
    return (
        <div className='grid grid-cols-3 px-2 py-3 border-b hover:bg-blue-50'>
            <div>
                <Link to={`${locationUrlMap[type]}/${data?.value?.url_slug}`} >
                    <div className='px-2 font-medium text-lg text-slate-700'>
                        {data?.value?.title}
                    </div>
                    <div className='px-2 text-xs text-slate-400'>{id}</div>
                </Link>
            </div>
            <div className={'text-right px-2'}>
                {locationNameMap[type]}
            </div>
            <div className={'text-right px-2'}>
                <Link to={`${locationUrlMap[type]}/${data?.value?.url_slug}`}
                      className={'fa-thin fa-eye px-2 py-1 mx-2 text-bold cursor-pointer'}
                      locationNameMap           title={'view'}
                />
                <Link to={`${locationUrlMap[type]}/edit/${data?.value?.url_slug}`}
                      className={'fa-thin fa-pencil px-2 py-1 mx-2 text-bold cursor-pointer'}
                      title={'edit'}
                />
            </div>
        </div>
    )
}

export const getConfig = ({
                              app,
                              type,
                              filter,
                              action = 'load',
                              tags,
                              attributes = [
                                  {key: 'id', label: 'id'},
                                  {key: 'app', label: 'app'},
                                  {key: 'type', label: 'type'},
                                  {key: 'data', label: 'data'},
                                  {key: 'updated_at', label: 'updated_at'},
                              ]}) => ({
    format: {
        app: app,
        type: type,
        attributes
    },
    children: [
        {
            type: () => {},
            action,
            filter: {
                options: JSON.stringify({
                    filter,
                }),
                tags,
                attributes: attributes.map(a => a.key)
            },
            path: '/'
        }
    ]
})

const icons = {
    view: 'fa-eye',
    edit: 'fa-pencil'
}
const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric",  minute: "numeric"}
const TemplatePages = ({item, params, logo, rightMenu, baseUrl=''}) => {
    const [pageSize, setPageSize] = useState(10);
    const {id} = params;
    const locations = [item.type]
    const menuItems=[
        {path: `${baseUrl}/templates`, name: 'Templates'}
    ]

    if (!id) return null;
    const [value, setValue] = useState([]);

    useEffect(() => {
        (async function () {
            const res = await locations.reduce(async (acc, type) => {
                const prevPages = await acc;
                const currentPages = await dmsDataLoader(
                    getConfig({
                        app: 'dms-site',
                        type: type,
                        filter: {[`data->>'template_id'`]: [id]}
                    }), '/');
                return [...prevPages, ...currentPages];
            }, Promise.resolve([]));

            setValue(res)
        })()
    }, [id]);

    const actionColumns = ['view', 'edit'];
    const columns = ['title', 'location', 'updated', ...actionColumns].map(col => ({
        Header: actionColumns.includes(col) ? '' : col,
        accessor: col,
        ...actionColumns.includes(col) && {
            Cell: cell => {
                console.log('cell', cell)
                return <Link to={cell.value}
                             className={`fa-thin ${icons[col]} px-2 py-1 mx-2 text-bold cursor-pointer`}
                             title={col}
                />
            },
        },
        // canFilter: !actionColumns.includes(col),
        filter: actionColumns.includes(col) ? undefined : 'text',
        disableSortBy: actionColumns.includes(col)
    }))

    const data = value.map(({type, data, updated_at}) => ({
        title: data.value.title,
        location: locationNameMap[type],
        view: `${locationUrlMap[type]}/${data?.value?.url_slug}`,
        edit: `${locationUrlMap[type]}/edit/${data?.value?.url_slug}`,
        updated: new Date(getNestedValue(updated_at)).toLocaleDateString(undefined, dateOptions)

    }))
    console.log('ites', value)
    return (
        <Layout
            topNav={{menuItems, position: 'fixed', logo, rightMenu }}
            sideNav={[]}
        >
            <div className='h-full flex-1 flex flex-col text-gray-900 bg-slate-100'>
                <div className='py-6 h-full'>
                    <div className='bg-white h-full shadow border max-w-6xl mx-auto px-6'>
                        <div className={'flex flex-col sm:flex-row justify-between'}>
                            <div className='flex flex-col'>
                                <label className='text-2xl pt-3 font-thin flex-1'><span
                                    className={'font-semibold'}>{item.title}</span> / Generated Pages</label>
                                <label className='text-sm font-thin flex-1 italic'>Showing {value?.length} items</label>
                            </div>
                            <div className={'text-xs'}>
                                <label>show</label>
                                <select
                                    className={'p-2 m-2 h-fit'}
                                    value={pageSize}
                                    onChange={e => setPageSize(e.target.value)}
                                >
                                    {
                                        [10, 25, 50, 75, 100].map(size => <option key={size}
                                                                                  value={size}>{size}</option>)
                                    }
                                </select>
                                <label>rows</label>
                            </div>
                        </div>
                        <div className='px-6 pt-8'>
                            <div className='shadow rounded border'>
                                <Table
                                    data={data}
                                    columns={columns}
                                    pageSize={pageSize}
                                />
                                {/*{*/}
                                {/*    value?.length ?*/}
                                {/*        value.map(item => (*/}
                                {/*            <TemplateRow key={item.id} {...item} />*/}
                                {/*        )) : <NoPages />*/}
                                {/*}*/}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
}

export default TemplatePages
