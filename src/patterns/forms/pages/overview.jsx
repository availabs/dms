import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import { get } from "lodash-es";
import SourcesLayout from "../components/patternListComponent/layout";
import {FormsContext} from "../siteConfig";
import Table from "../components/Table";
import dmsDataTypes from "../../../data-types";
import SourceCategories from "../components/patternListComponent/categories";
import {Link} from "react-router-dom";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const tableTheme = (opts = {color:'white', size: 'compact'}) => {
    const {color = 'white', size = 'compact'} = opts
    let colors = {
        white: 'bg-white hover:bg-blue-50',
        gray: 'bg-gray-100 hover:bg-gray-200',
        transparent: 'gray-100',
        total: 'bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold'
    }

    let sizes = {
        small: 'px-4 py-1 text-xs',
        compact: 'px-4 py-1 text-sm',
        full: 'px-10 py-5'
    }
    return {
        tableHeader:
            `${sizes[size]} pb-1 h-8 border border-b-4 border-gray-200 bg-slate-50 text-left font-semibold text-gray-700 uppercase first:rounded-tl-md last:rounded-tr-md`,
        tableInfoBar: "bg-white",
        tableRow: `${colors[color]} transition ease-in-out duration-150 hover:bg-blue-100`,
        totalRow: `${colors.total} transition ease-in-out duration-150`,
        tableOpenOutRow: 'flex flex-col',
        tableRowStriped: `bg-white odd:bg-blue-50 hover:bg-blue-100 bg-opacity-25 transition ease-in-out duration-150`,
        tableCell: `${sizes[size]} break-words border border-gray-200 pl-1 align-top font-light text-sm`,
        inputSmall: 'w-24',
        sortIconDown: 'fas fa-sort-amount-down text-tigGray-300 opacity-75',
        sortIconUp: 'fas fa-sort-amount-up text-tigGray-300 opacity-75',
        sortIconIdeal: 'fa fa-sort-alt text-tigGray-300 opacity-25',
        infoIcon: 'fas fa-info text-sm text-blue-300 hover:text-blue-500',
        vars: {
            color: colors,
            size: sizes
        }
    }

}

const defaultLexicalValue = {
    "root": {
        "type": "root",
        "format": "",
        "indent": 0,
        "version": 1,
        "children": [
            {
                "type": "paragraph",
                "format": "",
                "indent": 0,
                "version": 1,
                "children": [
                    {
                        "mode": "normal",
                        "text": "No Description",
                        "type": "text",
                        "style": "",
                        "detail": 0,
                        "format": 0,
                        "version": 1
                    }
                ],
                "direction": "ltr"
            }
        ],
        "direction": "ltr"
    }
}

const RenderPencil = ({user, editing, setEditing, attr}) => {
    if (user?.authLevel <= 5) return null;

    return (
        <div className='hidden group-hover:block text-blue-500 cursor-pointer'
             onClick={e => editing === attr ? setEditing(null) : setEditing(attr)}>
            <i className="fad fa-pencil absolute -ml-4 p-2.5 rounded hover:bg-blue-500 hover:text-white "/>
        </div>
    )
}

const OverViewEdit = ({
      status,
      apiUpdate,
      attributes,
      dataItems,
      format,
      item,
      setItem,
      updateAttribute,
      params,
      submit,
      apiLoad
}) => {
    const {app, falcor, falcorCache, baseUrl, pageBaseUrl, user} = useContext(FormsContext);

    const [editing, setEditing] = useState();
    const columns = useMemo(() => isJson(item.config) ? JSON.parse(item.config)?.attributes : [], [item.config]);
    const [pageSize, setPageSize] = useState(15);

    const updateData = (data, attrKey) => {
        console.log('updating data', item, attrKey, data, format)
        apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
    }

    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"}
    const createdTimeStamp = new Date(item?.created_at || '').toLocaleDateString(undefined, dateOptions);
    const updatedTimeStamp = new Date(item?.updated_at || '').toLocaleDateString(undefined, dateOptions);
    const DescComp = useMemo(() => editing === 'description' ? attributes['description'].EditComp : attributes['description'].ViewComp, [editing]);
    const CategoriesComp = SourceCategories // useMemo(() => editing === 'categories' ? attributes['categories'].EditComp : attributes['categories'].ViewComp, [editing]);

    console.log('props',item, baseUrl, pageBaseUrl, params.id)
    const Lexical = dmsDataTypes.lexical.ViewComp;

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Overview', href: `${pageBaseUrl}/${params.id}`}}
                       id={params.id} //page id to use for navigation
        >
            <div className={'p-4 bg-white flex flex-col'}>
                <div className={'mt-1 text-2xl text-blue-600 font-medium overflow-hidden sm:mt-0 sm:col-span-3'}>
                    {item.name || item.doc_type}
                </div>

                <div className={'flex flex-col md:flex-row'}>
                    <div
                        className="w-full md:w-[70%] pl-4 py-2 sm:pl-6 flex justify-between group text-sm text-gray-500 pr-14">
                        <DescComp
                            value={editing === 'description' ? item?.description : (item?.description || defaultLexicalValue)}
                            onChange={(v) => {
                                // setItem({...item, ...{description: v}})
                                updateData(v, 'description')
                            }}
                            {...attributes.description}
                        />
                        <RenderPencil attr={'description'} user={user} editing={editing} setEditing={setEditing}/>
                    </div>

                    <div className={'w-full md:w-[30%]'}>
                        <div className={'mt-2 flex flex-col px-6 text-sm text-gray-600'}>
                            Created
                            <span className={'text-l font-medium text-blue-600 '}>{createdTimeStamp}</span>
                        </div>

                        <div className={'mt-2 flex flex-col px-6 text-sm text-gray-600'}>
                            Updated
                            <span className={'text-l font-medium text-blue-600 '}>{updatedTimeStamp}</span>
                        </div>

                        <div key={'categories'} className='flex justify-between group'>
                            <div className="flex-1 sm:grid sm:grid-cols-2 sm:gap-1 sm:px-6">
                                <dt className="text-sm font-medium text-gray-500 mt-1.5">{'Categories'}</dt>
                                <dd className="text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                    <div className="pb-2 px-2 relative">
                                        <CategoriesComp
                                            value={Array.isArray(item?.categories) ? item?.categories : []}
                                            onChange={(v) => {
                                                // setItem({...item, ...{categories: v}})
                                                updateData(v, 'categories')
                                            }}
                                            editingCategories={editing === 'categories'}
                                            stopEditingCategories={() => setEditing(null)}
                                            {...attributes.categories}
                                        />
                                    </div>
                                </dd>
                            </div>
                            <RenderPencil attr={'categories'} user={user} editing={editing} setEditing={setEditing}/>
                        </div>
                    </div>
                </div>

                <div className={'flex items-center p-2 mx-4 text-blue-600 hover:bg-blue-50 rounded-md'}
                >
                    Columns
                    <span
                        className={'bg-blue-200 text-blue-600 text-xs p-1 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>
                    {columns.length}
                </span>
                </div>

                <div className={'w-full p-4'}>
                    <Table
                        columns={
                            ['column', 'description'].map(col => ({
                                Header: col,
                                accessor: col,
                                align: 'left',
                                width: col === 'column' ? '30%' : '70%',
                                minWidth: col === 'column' ? '30%' : '70%',
                                maxWidth: col === 'column' ? '30%' : '70%'
                            }))
                        }
                        data={
                            columns.map(col => ({
                                column: (
                                    <div className='pr-8 font-bold'>
                                        {get(col, 'display_name', get(col, 'name')) || 'No Name'}
                                        <span className={'italic pl-1 pt-3 pr-8 font-light'}>({get(col, 'type')})</span>
                                    </div>),
                                description: get(col, ['description', 'root']) ?
                                    <Lexical value={get(col, 'description')}/> : <div
                                        className={'pl-6'}>{JSON.stringify(get(col, 'description')) || 'No Description'}</div>
                            }))
                        }
                        pageSize={pageSize}
                        striped={true}
                        theme={tableTheme()}
                    />
                    {
                        columns.length > 15 ?
                            <div className={'float-right text-blue-600 underline text-sm cursor-pointer'}
                                 onClick={() => setPageSize(pageSize === 15 ? columns.length : 15)}
                            >{pageSize > 15 ? 'see less' : 'see more'}</div> : null
                    }
                </div>

                <div className={'w-full p-4'}>
                    <Table
                        columns={
                            ['name', 'created_at', 'updated_at'].map(col => ({
                                Header: col.replace('_', ' '),
                                accessor: col,
                                align: 'left',
                                width: col === 'name' ? '50%' : '25%',
                                minWidth: col === 'name' ? '50%' : '25%',
                                maxWidth: col === 'name' ? '50%' : '25%',
                            }))
                        }
                        data={
                            (item?.views || []).map(({id, name, created_at, updated_at}) => ({
                                name: (
                                    <div className=''>
                                        <Link to={`${pageBaseUrl}/${params.id}/view/${id}`}>{name || 'No Name'}</Link>
                                    </div>),
                                created_at: (new Date(created_at.replace(/"/g, ''))).toLocaleString(),
                                updated_at: (new Date(updated_at.replace(/"/g, ''))).toLocaleString()
                            }))
                        }
                        pageSize={5}
                        striped={true}
                        sortBy={'created_at'}
                        sortOrder={'desc'}
                        theme={tableTheme()}
                    />
                </div>

                </div>
        </SourcesLayout>
)
}

OverViewEdit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Pattern Overview',
    "type": 'CenRep',
    "variables": [],
    // getData,
    "EditComp": OverViewEdit,
    "ViewComp": OverViewEdit
}