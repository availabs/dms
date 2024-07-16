import React, { useMemo, useState, useEffect }from 'react'
import RenderColumnControls from "./components/RenderColumnControls";
import RenderTypeControls from "./components/RenderTypeControls"
import Glide from './components/glide';
import {RenderSimple} from "./components/SijmpleSpreadsheet";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getNestedValue = value =>
    value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) :
        !value?.value && typeof value?.value === 'object' ? '' : value;

const getData = async ({format, apiLoad, currentPage, pageSize, orderBy}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const fromIndex = currentPage*pageSize;
    const toIndex = currentPage*pageSize + pageSize-1;
    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                orderBy: Object.keys(orderBy).reduce((acc, curr) => ({...acc, [`data->>'${curr}'`]: orderBy[curr]}) , {})
            }),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
    return data;

}

const getLength = async ({format, apiLoad}) =>{
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'length',
        path: '/',
        filter: {
            options: JSON.stringify({})
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
    return length;
}


const tableComps = {
    'simple': RenderSimple,
    'glide': Glide
}

const RenderPagination = ({totalPages, pageSize, currentPage, setVCurrentPage}) => {
    const numNavBtns = Math.ceil(totalPages / pageSize);

    return (
        <div className={'float-right flex no-wrap items-center p-1'}>
            <div className={'mx-1 cursor-pointer text-gray-500 hover:text-gray-800'} onClick={() => setVCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>
            <select
                className={'p-2 border-2 text-gray-800 hover:bg-blue-50 text-sm rounded-md'}
                value={currentPage}
                onChange={e => setVCurrentPage(+e.target.value)}
            >
                {
                    [...new Array(numNavBtns).keys()]
                        .map((i) =>
                            <option
                                className={'p-2 border-2 text-gray-800 hover:bg-blue-50 text-sm'}
                                value={i} key={i}>{i + 1}
                            </option>)
                }
            </select>
            <div className={'mx-1 cursor-pointer text-gray-500 hover:text-gray-800'} onClick={() => setVCurrentPage(currentPage < totalPages ? currentPage + 1 : currentPage)}>{`next >>`}</div>
        </div>)
}

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const isEdit = onChange;
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [length, setLength] = useState(cachedData.length || 0);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState(cachedData.attributes || []);
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData.visibleAttributes || []);
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [newItem, setNewItem] = useState({})
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [currentPage, setCurrentPage] = useState(0);
    const [tableType, setTableType] = useState(cachedData.tableType || 'simple')
    const pageSize = 10// cachedData.pageSize || 5;
    // ========================================= init comp begin =======================================================
    useEffect(() => {
        setAttributes(JSON.parse(format?.config || '{}')?.attributes || [])
    }, [format]);

    useEffect(() => {
        async function load() {
            if(data) return;
            // init stuff
            setLoading(true)
            const length = await getLength({format, apiLoad});
            const d = await getData({format, apiLoad, currentPage, pageSize, orderBy});
            setData(d);
            setLength(length);
            !visibleAttributes?.length && setVisibleAttributes(attributes?.map(attr => attr.name));
            setLoading(false)
        }

        load()
    }, [format])
    // ========================================== init comp end ========================================================

    // ========================================== get data begin =======================================================
    useEffect(() => {
        // onPageChange
        async function load() {
            setLoading(true)
            const length = await getLength({format, apiLoad});
            const data = await getData({format, apiLoad, currentPage, pageSize, orderBy});
            setLength(length);
            setData(data);
            setLoading(false)
            console.log('called getdata', data)
        }

        load()
    }, [currentPage, orderBy]);
    // =========================================== get data end ========================================================

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;

        onChange(JSON.stringify({visibleAttributes, pageSize, attributes, orderBy, tableType, colSizes}));
    }, [visibleAttributes, attributes, orderBy, tableType, colSizes])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
        // console.log('updating', {...d, [attribute.name]: value})
        return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}})
    }

    const addItem = () => {
        return apiUpdate({data: newItem, config: {format}}) && setNewItem({})
    }

    const removeItem = item => {
        setData(data.filter(d => d.id !== item.id))
        return apiUpdate({data: item, config: {format}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================

    const TableComp = useMemo(() => tableComps[tableType], [tableType])
    return (
        <div>

            {
                isEdit &&
                <div className={'flex'}>
                    <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                                          visibleAttributes={visibleAttributes}
                                          setVisibleAttributes={setVisibleAttributes}/>

                    <RenderTypeControls tableType={tableType} setTableType={setTableType}/>
                </div>
            }
            {
                loading ? <div>loading...</div> :
                    <TableComp {...{
                        data,
                        setData,
                        visibleAttributes,
                        setVisibleAttributes,
                        attributes,
                        isEdit,
                        orderBy,
                        setOrderBy,
                        updateItem,
                        removeItem,
                        addItem,
                        newItem,
                        setNewItem,
                        colSizes,
                        setColSizes,
                    }} />

            }
            {/*Pagination*/}
            <RenderPagination totalPages={length} pageSize={10} currentPage={currentPage}
                              setVCurrentPage={setCurrentPage}/>
        </div>
    )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Spreadsheet',
    "type": 'table',
    "variables": [],
    getData,
    "EditComp": Edit,
    "ViewComp": Edit
}