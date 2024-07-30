import React, { useMemo, useState, useEffect }from 'react'
import RenderColumnControls from "./components/RenderColumnControls";
import RenderFilterControls from "./components/RenderFilterControls";
import RenderTypeControls from "./components/RenderTypeControls"
import Glide from './components/glide';
import {RenderSimple} from "./components/SimpleSpreadsheet";
import {RenderPagination} from "./components/RenderPagination";
import {isJson, getLength, getData} from "./utils";
import {RenderFilters} from "./components/RenderFilters";
import {useSearchParams} from "react-router-dom";

const tableComps = {
    'simple': RenderSimple,
    'glide': Glide
}

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const isEdit = Boolean(onChange);
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [length, setLength] = useState(cachedData.length || 0);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState([]);
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData.visibleAttributes || []);
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [newItem, setNewItem] = useState({})
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [filters, setFilters] = useState(cachedData.filters || []);
    const [currentPage, setCurrentPage] = useState(0);
    const [tableType, setTableType] = useState(cachedData.tableType || 'simple');
    const pageSize = 50// cachedData.pageSize || 5;
    const filterValueDelimiter = '|||'

    // ========================================= filters ===============================================================
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));
        setFilters(filtersFromURL)
    }, [searchParams]);
    // ========================================= filters end ===========================================================

    // ========================================= init comp begin =======================================================
    useEffect(() => {
        setAttributes(JSON.parse(format?.config || '{}')?.attributes || [])
    }, [format]);

    useEffect(() => {
        async function load() {
            if(data) return;
            // init stuff
            setLoading(true)
            const length = await getLength({format, apiLoad, filters});
            const d = await getData({format, apiLoad, currentPage, pageSize, orderBy, filters});
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
            const length = await getLength({format, apiLoad, filters});
            const data = await getData({format, apiLoad, currentPage, pageSize, orderBy, filters});
            console.log('new length', length)
            setLength(length);
            setData(data);
            setLoading(false)
        }

        load()
    }, [currentPage, orderBy, filters]);
    // =========================================== get data end ========================================================

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;

        onChange(JSON.stringify({visibleAttributes, pageSize, attributes, orderBy, tableType, colSizes, filters}));
    }, [visibleAttributes, attributes, orderBy, tableType, colSizes, filters])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
        if(value !== undefined && attribute){
            return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}});
        }

        let dataToUpdate = Array.isArray(d) ? d : [d];

        let tmpData = [...data];
        dataToUpdate.map(dtu => {
            const i = data.findIndex(dI => dI.id === dtu.id);
            tmpData[i] = dtu;
        });
        setData(tmpData)
        return Promise.all(dataToUpdate.map(dtu => apiUpdate({data: dtu, config: {format}})));
    }

    const addItem = () => {
        return apiUpdate({data: newItem, config: {format}}) && setNewItem({})
    }

    const removeItem = item => {
        setData(data.filter(d => d.id !== item.id))
        return apiUpdate({data: item, config: {format}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================

    const TableComp = useMemo(() => tableComps[tableType], [tableType]);

    return (
        <div className={'w-full'}>

            {
                isEdit &&
                <div className={'flex'}>
                    <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                                          visibleAttributes={visibleAttributes}
                                          setVisibleAttributes={setVisibleAttributes}/>
                    <RenderFilterControls attributes={attributes} visibleAttributes={visibleAttributes}
                                          filters={filters} setFilters={setFilters}
                    />

                    <RenderTypeControls tableType={tableType} setTableType={setTableType}/>
                </div>
            }
            <RenderFilters attributes={attributes} filters={filters} setFilters={setFilters} apiLoad={apiLoad} format={format} delimiter={filterValueDelimiter}/>
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
            <RenderPagination totalPages={length} pageSize={pageSize} currentPage={currentPage}
                              setVCurrentPage={setCurrentPage} visibleAttributes={visibleAttributes}/>
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