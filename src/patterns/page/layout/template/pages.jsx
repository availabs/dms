import React, {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../index.js";
import {DeleteModal} from "./list.jsx";
import Layout from '../components/avail-layout'


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

export const getConfig = ({app, type, filter, action = 'load', tags}) => ({
    format: {
        app: app,
        type: type,
        attributes: [
            {
                key: 'id', label: 'id'
            },
            {
                key: 'app', label: 'app'
            },
            {
                key: 'type', label: 'type'
            },
            {
                key: "data->>'title'", label: 'data'
            }
        ]
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
                attributes: ['id', 'app', 'type', 'data']
            },
            path: '/'
        }
    ]
})

 const TemplatePages = ({item, params, logo, rightMenu, baseUrl=''}) => {
    const {id} = params;
    //console.log('item', item)
    const locations = [item.type]
    const menuItems=[
     {path: `${baseUrl}/templates`, name: 'Templates'}
    ]

    //console.log('locations', locations)

    if (!id) return null;
    const [value, setValue] = useState([]);

    useEffect(() => {
        (async function () {
            const res = await locations.reduce(async (acc, type) => {
                const prevPages = await acc;
                const currentPages = await dmsDataLoader(getConfig({app: 'dms-site', type:type, filter: {[`data->>'template_id'`]: [id]}}), '/');
                console.log('currentPages', currentPages, id)
                return [...prevPages, ...currentPages];
            }, Promise.resolve([]));
            //console.log('res', res, id)
            //if()
            setValue(res)
        })()
    }, [id]);

    return (
        <Layout 
            topNav={{menuItems, position: 'fixed', logo, rightMenu }} 
            sideNav={[]}
       >
            <div className='h-full flex-1 flex flex-col text-gray-900 bg-slate-100'>
                <div className='py-6 h-full'>
                    <div className='bg-white h-full shadow border max-w-6xl mx-auto px-6'>
                        <div className='flex items-center'>
                            <div className='text-2xl p-3 font-thin flex-1'>Pages</div>
                        </div>
                        <div className='px-6 pt-8'>
                            <div className='shadow rounded border'>
                                {
                                    value?.length ?
                                        value.map(item => (
                                            <TemplateRow key={item.id} {...item} />
                                        )) : <NoPages />
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
}

export default TemplatePages
