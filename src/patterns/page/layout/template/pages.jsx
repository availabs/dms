import React, {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../api";
import {DeleteModal} from "./list.jsx";
import Layout from '../components/avail-layout'
// import {Table} from "~/modules/avl-components/src";
import {getNestedValue} from "../../../forms/utils/getNestedValue";
import {pgEnv} from "../components/utils/constants";
import { CMSContext } from "../../siteConfig";
import get from "lodash/get";

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
    view: 'fa-thin fa-eye',
    edit: 'fa-thin fa-pencil'
}

const statusConfig = {
    success: {
        textColor: 'text-green-400',
        icon: 'fa-thin fa-check'
    },
    error: {
        textColor: 'text-red-400',
        icon: 'fa-thin fa-warning'
    }
}

const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric",  minute: "numeric"}

const findNameCol = data => Object.keys(data).find(col => col.toLowerCase().includes('name') || col.toLowerCase().includes('title'))
const getMetaName = (id_column, id, data) => id_column === 'geoid' ?
    data?.['county'] || data?.['name'] || id :
    data?.[findNameCol(data)] || id
const TemplatePages = ({item, params, logo, rightMenu, baseUrl=''}) => {
    const [pageSize, setPageSize] = useState(10);
    const { falcor, falcorCache} = React.useContext(CMSContext)
    const {id} = params;
    const view_id = item.data_controls?.view?.view_id;
    const id_column = item.data_controls?.id_column?.name;
    const locations = [item.type]
    const menuItems=[{path: `${baseUrl}/templates`, name: 'Templates'}]

    if (!id) return null;
    const [value, setValue] = useState([]);

    useEffect(() => {
        // get generated pages
        (async function () {
            const res = await locations.reduce(async (acc, type) => {
                const prevPages = await acc;
                const currentPages = await dmsDataLoader(
                    falcor,
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

    useEffect(() => {
        if(!view_id) return;

        // get length of available ic_col values
        (async function () {
            falcor.get(["dama", pgEnv, "viewsbyId", view_id, "data", "length"])
        })()
    }, [id, view_id]);

    const icColDataLen = React.useMemo(() => {
        return get(
            falcorCache,
            ["dama", pgEnv, "viewsbyId", view_id, "data", "length"],
            0
        );
    }, [id, pgEnv, view_id, falcorCache]);

    useEffect(() => {
        if(!view_id) return;

        // get length of available ic_col values
        (async function () {
            falcor
                .get(
                    [
                        "dama",
                        pgEnv,
                        "viewsbyId",
                        view_id,
                        "databyIndex",
                        {"from":0, "to": icColDataLen-1},
                        Object.keys(item.data_controls.active_row || {}),
                    ]
                )
        })()
    }, [id, pgEnv, view_id, falcorCache]);


    const idColDataRows = React.useMemo(()=>{
        return Object.values(get(falcorCache,[
            "dama",
            pgEnv,
            "viewsbyId",
            view_id,
            "databyIndex"
        ],{})).map(v => get(falcorCache,[...v.value],''))
    },[id, id_column, view_id, falcorCache])

    const actionColumns = ['view', 'edit'];
    const statusColumns = ['status'];
    const columns = ['title', 'location', 'updated', 'status', ...actionColumns].map(col => ({
        Header: actionColumns.includes(col) ? '' : col,
        accessor: col,
        ...actionColumns.includes(col) && {
            Cell: cell => {
                return <Link to={cell.value}
                             className={` ${icons[col]} px-2 py-1 mx-2 text-bold cursor-pointer`}
                             title={col}
                />
            },
        },
        ...statusColumns.includes(col) && {
            Cell: cell => {
                return <i
                    className={`${statusConfig[cell.value].icon} ${statusConfig[cell.value].textColor} font-bold`}
                    title={cell.value}
                />

            },
        },
        ...['updated'].includes(col) && {
            Cell: cell => {
                return new Date(cell.value).toLocaleDateString(undefined, dateOptions)

            },
        },
        // canFilter: !actionColumns.includes(col),
        filter: actionColumns.includes(col) || statusColumns.includes(col) ? undefined : 'text',
        disableSortBy: actionColumns.includes(col),
        align: actionColumns.includes(col) || statusColumns.includes(col) ? 'center' : 'left',
        width: actionColumns.includes(col) || statusColumns.includes(col) ? '5%' : '20%'
    }))

    const data = value.map(({type, data, updated_at}) => {
        const v = idColDataRows.find(d => d[id_column] === data.value.id_column_value)
        return {
            title: getMetaName(id_column, data.value.id_column_value, v) || data.value.title,
            location: locationNameMap[type],
            view: `${locationUrlMap[type]}/${data?.value?.url_slug}`,
            edit: `${locationUrlMap[type]}/edit/${data?.value?.url_slug}`,
            updated: getNestedValue(updated_at),
            status: data?.value?.num_errors > 0 ? 'error' : 'success'

        }
    })

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
                                <label className='text-sm font-thin flex-1 italic'>Showing {value?.length} generated / {icColDataLen} available items</label>
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
                                {/*<Table
                                    data={data}
                                    columns={columns}
                                    pageSize={pageSize}
                                />*/}
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
