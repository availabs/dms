import React, {useMemo, useState, useEffect, useRef, useContext} from 'react'
import { get } from "lodash-es";
import SourcesLayout from "../components/DatasetsListComponent/layout"
import {DatasetsContext} from "../siteConfig";
import SourceCategories from "../components/DatasetsListComponent/categories";
import {Link} from "react-router";
import {ExternalSourceAttributes, ExternalViewAttributes} from "./consts";

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

const RenderPencil = ({user, editing, setEditing, attr, show}) => {
    if (!show) return null;

    return (
        <div className='hidden group-hover:block text-blue-500 cursor-pointer'
             onClick={e => editing === attr ? setEditing(null) : setEditing(attr)}>
            <i className="fad fa-pencil absolute -ml-4 p-2.5 rounded hover:bg-blue-500 hover:text-white "/>
        </div>
    )
}

export default function Overview ({
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
}) {
    const ref = useRef(null);
    const {baseUrl, pageBaseUrl, user, isUserAuthed, UI, falcor} = useContext(DatasetsContext);
    const {ColumnTypes, Table} = UI;

    const {pgEnv, id} = params;
    const isDms = pgEnv === 'internal';

    const [source, setSource] = useState(isDms ? item : {});
    const [editing, setEditing] = useState();
    const [pageSize, setPageSize] = useState(15);

    let columns = useMemo(() =>
        isDms ?
            isJson(item.config) ? JSON.parse(item.config)?.attributes : [] :
            (source?.metadata?.columns || []), [item.config, isDms, source?.metadata?.columns])

    console.log('pgEnv', pgEnv, params)

    const updateData = (data, attrKey) => {
        // todo sourceType based
        console.log('updating data', item, attrKey, data, format)
        if(isDms) {
            apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
            setSource({...source, [attrKey]: data})
        }
    }

    useEffect(() => {
        if(isDms){
            // use item
        }else{
            if(!id || !pgEnv) return;
            // fetch source data
            async function getViews () {
                const reqLenPath = ['uda', pgEnv, 'sources', 'byId', +id, 'views', 'length'];
                const resLenJson = await falcor.get(reqLenPath);
                const len = get(resLenJson, ['json', ...reqLenPath], 0);
                if(!len) return;

                const reqIndexPath = ['uda', pgEnv, 'sources', 'byId', +id, 'views', 'byIndex'];
                const resIndexJson = await falcor.get([...reqIndexPath, {from: 0, to: len - 1}, ExternalViewAttributes]);
                const views = get(resIndexJson, ['json', ...reqIndexPath], {})
                return Object.values(views).filter(version => ++version.view_id).map(({version, _created_timestamp, _updated_timestamp, ...rest}) => ({
                    name: version,
                    created_at: _created_timestamp,
                    updated_at: _updated_timestamp,
                    ...rest
                }));
            }
            async function getSourceData () {
                const views = await getViews();
                console.log('views', views)
                const reqPath = ['uda', pgEnv, 'sources', 'byId', +id]
                const resJson = await falcor.get([...reqPath, ExternalSourceAttributes]);
                const res = get(resJson, ['json', ...reqPath], {})
                setSource({...res, views});
                console.log('res', res)
            }

            getSourceData();
        }
    }, [isDms, item.config])
    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"}
    const createdTimeStamp = new Date(item?.created_at || '').toLocaleDateString(undefined, dateOptions);
    const updatedTimeStamp = new Date(item?.updated_at || '').toLocaleDateString(undefined, dateOptions);
    const DescComp = useMemo(() => editing === 'description' ? ColumnTypes.lexical.EditComp : ColumnTypes.lexical.ViewComp, [editing, source?.description]);
    const CategoriesComp = SourceCategories // useMemo(() => editing === 'categories' ? attributes['categories'].EditComp : attributes['categories'].ViewComp, [editing]);

    if(!Object.entries(source).length) return 'loading...';
    console.log('columns', columns)
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source?.name || source?.doc_type, href: format.url_slug}}
                       page={{name: 'Overview', href: `${pageBaseUrl}/${params.id}`}}
                       id={params.id} //page id to use for navigation
            >
            <div className={'p-4 bg-white flex flex-col'}>
                <div className={'mt-1 text-2xl text-blue-600 font-medium overflow-hidden sm:mt-0 sm:col-span-3'}>
                    {source?.name || source?.doc_type}
                </div>

                <div className={'flex flex-col md:flex-row'}>
                    <div
                        className="w-full md:w-[70%] pl-4 py-2 sm:pl-6 flex justify-between group text-sm text-gray-500 pr-14">
                        <DescComp
                            value={editing === 'description' ? source?.description : (source?.description)}
                            onChange={(v) => {
                                // setItem({...item, ...{description: v}})
                                updateData(v, 'description')
                            }}
                            {...attributes.description}
                        />
                        <RenderPencil attr={'description'} user={user} editing={editing} setEditing={setEditing} show={isUserAuthed(['update-source'])}/>
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
                        <div className={'mt-2 flex flex-col px-6 text-sm text-gray-600'}>
                            Type
                            <span className={'text-l font-medium text-blue-600 '}>{source?.doc_type || source?.type}</span>
                        </div>

                        <div key={'categories'} className='flex justify-between group'>
                            <div className="flex-1 sm:grid sm:grid-cols-2 sm:gap-1 sm:px-6">
                                <dt className="text-sm font-medium text-gray-500 mt-1.5">{'Categories'}</dt>
                                <dd className="text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                                    <div className="pb-2 px-2 relative">
                                        <CategoriesComp
                                            value={Array.isArray(source?.categories) ? source?.categories : []}
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
                            <RenderPencil attr={'categories'} user={user} editing={editing} setEditing={setEditing} show={isUserAuthed(['update-source'])}/>
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
                        gridRef={ref}
                        columns={
                            ['display_name', 'type', 'description'].map(col => ({
                                name: col,
                                display_name: col,
                                type: 'ui',
                                show: true,
                                align: 'left',
                            }))
                        }
                        data={columns.slice(0, pageSize > 15 ? columns.length : 15)}
                        display={{
                            striped: true
                        }}
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
                        gridRef={ref}
                        columns={
                            ['name', 'created_at', 'updated_at'].map(col => ({
                                name: col,
                                display_name: col,
                                type: 'ui',
                                Comp: ({value, row, ...rest}) => {
                                    console.log('props', rest)
                                    return (
                                        <div {...rest}>
                                            {
                                                col === 'name' ?
                                                    <Link
                                                        to={`${pageBaseUrl}/${pgEnv}/${params.id}/view/${row?.view_id}`}>{value || 'No Name'}</Link> :
                                                    <div>{new Date(value?.replace(/"/g, ''))?.toLocaleString()}</div>
                                            }
                                        </div>
                                    )
                                },
                                show: true,
                                align: 'left'
                            }))
                        }
                        data={(source?.views || [])}
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