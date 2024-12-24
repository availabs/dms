import React, {useState, useEffect} from 'react'
import {RenderSimple} from "./components/SimpleSpreadsheet";
import {RenderPagination} from "./components/RenderPagination";
import {isJson, getLength, getData, convertToUrlParams, init} from "./utils/utils";
import {RenderFilters} from "./components/RenderFilters";
import {RenderAttribution} from "./components/RenderAttribution";
import {useSearchParams, useNavigate} from "react-router-dom";
import {FormsSelector} from "../../FormsSelector";
import {ColumnControls} from "../shared/ColumnControls";
import {Card} from "../Card";
import { isEqual } from "lodash-es";
import { v4 as uuidv4 } from 'uuid';

const Edit = ({value, onChange, size, format: formatFromProps, pageFormat, apiLoad, apiUpdate, renderCard, ...rest}) => {
    const isEdit = Boolean(onChange);
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [view, setView] = useState(cachedData.view);
    const [length, setLength] = useState(cachedData.length || 0);
    const [data, setData] = useState(cachedData.data || []);
    const [hasMore, setHasMore] = useState();
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState([]);
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData.visibleAttributes || []);
    const [newItem, setNewItem] = useState({})

    // can these merge into one variable? colStyle, setColStyle
    const [customColNames, setCustomColNames] = useState(cachedData.customColNames || {});
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [colJustify, setColJustify] = useState(cachedData.colJustify || {});
    const [formatFn, setFormatFn] = useState(cachedData.formatFn || {});
    const [fontSize, setFontSize] = useState(cachedData.fontSize || {});
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [fn, setFn] = useState(cachedData.fn || {});
    const [linkCols, setLinkCols] = useState(cachedData.linkCols || {}); // {isLink, linkText, location}

    const [filters, setFilters] = useState(cachedData.filters || []);
    const [groupBy, setGroupBy] = useState(cachedData.groupBy || []);
    const [actions, setActions] = useState(cachedData.actions || []);
    const [notNull, setNotNull] = useState(cachedData.notNull || []);
    const [showTotal, setShowTotal] = useState(cachedData.showTotal);
    const [striped, setStriped] = useState(cachedData.striped);
    const [allowDownload, setAllowDownload] = useState(cachedData.allowDownload);
    const [allowEditInView, setAllowEditInView] = useState(cachedData.allowEditInView);
    const [allowSearchParams, setAllowSearchParams] = useState(cachedData.allowSearchParams === undefined ? true : cachedData.allowSearchParams);
    const [usePagination, setUsePagination] = useState(cachedData.usePagination);
    const [pageSize, setPageSize] = useState(cachedData.pageSize || 5);
    // const [dataSize, setDataSize] = useState(cachedData.dataSize || 500);


    const [currentPage, setCurrentPage] = useState(0);
    const [actionUrls, setActionUrls] = useState(cachedData.actionUrls || {viewUrl: '', editUrl: ''});
    const filterValueDelimiter = '|||'
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [loadMoreId, setLoadMoreId] = useState(cachedData.loadMoreId);
    const showChangeFormatModal = !formatFromProps;
    // const isInitialRender = useRef(true);

    // ========================================= init comp begin =======================================================
    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        if(isEqual(format, formatFromProps)) return;
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);

    useEffect(() => {
        const newAttributes = JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [];
        if(isEqual(attributes, newAttributes)) return;
        setAttributes(JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [])
    }, [format]);

    useEffect(() => {
        // transitioning from int view to obj view
        const tmpViewId = typeof view === 'object' ? view.id : view;
        if(!format || !view || format.view_id === tmpViewId) return;
        const originalDocType = format.originalDocType || format.doc_type;
        const doc_type = originalDocType?.includes('-invalid-entry') ?
            originalDocType.replace('-invalid-entry', `${tmpViewId}-invalid-entry`) :
            `${originalDocType}-${tmpViewId}`;
        const view_id = tmpViewId; // this has to be the id. API uses this for UDA call.

        setFormat(format.doc_type ? {...format, doc_type, type: doc_type, originalDocType, view_id} : {...format, view_id})
    }, [view])

    useEffect(() => setColSizes({}), [size]); // on size change, reset column sizes.
    // useEffect(() => setLength(data.length), [data]); // on data change, reset length.
    // ========================================= filters begin =====----================================================
    useEffect(() => {
        if(!allowSearchParams) return;

        // if filters === cachedData.filters, and search params exist, avoid navigating
        // the only time you should navigate is when filters change.
        // the state variable will change before cachedData, this is one way to detect if this useEffect is being called
        // on init values. Though navigation should happen on init values if search params don't exist.
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));

        const urlMatchesFilters = isEqual(filtersFromURL, filters);
        const filtersMatchSavedFilters = isEqual(filters, cachedData.filters);
        if(filtersMatchSavedFilters && filtersFromURL.length) return;

        const url = convertToUrlParams(filters, filterValueDelimiter); // url based on current filters

        // this triggers and the old filters (from cached data) take over.
        if(url.length && url !== window.location.search.replace('?', '') || (!url.length && !filters.length)) {
            // console.log('debugging: navigating to url 2', url, window.location.search.replace('?', ''))
            navigate(`?${url}`)
        }

    }, [allowSearchParams, filters]);

    useEffect(() => {
        if(!allowSearchParams) return;
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));
        if(filtersFromURL.length) {
            // if filters !== url search params, set filters. no need to navigate.
            setFilters(oldFilters => {
                const newFilters = [
                    ...new Set([
                        ...(filtersFromURL.filter(f => f.column).map(f => f.column)),
                        ...(oldFilters.filter(f => f.column).map(f => f.column))
                    ])
                ].map(column => ({
                    column,
                    values: [...new Set(
                        [
                            ...((oldFilters || []).find(f => f.column === column)?.values || []),
                            ...((filtersFromURL || []).find(f => f.column === column)?.values || []),
                        ].filter(f => f)
                    )],
                    valueSets: (oldFilters || []).find(f => f.column === column)?.valueSets
                }))

                return newFilters
            })
            setLength(undefined)
            setHasMore(undefined)
        }
    }, [allowSearchParams, searchParams]);
    // ========================================= filters end =====----==================================================
    useEffect(() => {
        // init stuff. only run when format changes.
        async function load() {
            if(!format?.config && !format?.metadata?.columns) return;
            setLoading(true)
            if(!loadMoreId) setLoadMoreId(`id${uuidv4()}`)
            const length = await getLength({format, apiLoad, filters, groupBy, notNull});
            const d = await getData({
                format, apiLoad, currentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            setData(d);
            setLength(length);
            // !visibleAttributes?.length && setVisibleAttributes((attributes || []).slice(0, 5).map(attr => attr.name));
            setLoading(false)
        }

        load()
    }, [format])
    // ========================================== init comp end ========================================================

    // ========================================== get data begin =======================================================
    useEffect(() => {
        // only run when controls change
        let isCancelled = false;
        async function load() {
            if(!format?.config && !format?.metadata?.columns) return;
            setLoading(true)
            // setData([]);
            // setLength(0);
            // setHasMore(false);

            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const length = await getLength({format, apiLoad, filters, groupBy, notNull});
            if(isCancelled) return;
            const data = await getData({
                format, apiLoad, currentPage: newCurrentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            if(isCancelled) return;

            setLength(length);
            setData(data); // if page didn't change, set data as it comes
            setCurrentPage(newCurrentPage);
            setHasMore((newCurrentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
        return () => {
            isCancelled = true;
        };
    }, [orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal, pageSize]);

    useEffect(() => {
        // only run when page changes

        async function load() {
            if(!format?.config && !format?.metadata?.columns) return;
            setLoading(true)
            const length = await getLength({format, apiLoad, filters, groupBy});
            const data = await getData({
                format, apiLoad, currentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            // setLength(length);
            setData(prevData => currentPage > 0 && !usePagination ? [...prevData.filter(r => !r.totalRow), ...data] : data); // on page change append unless using pagination
            setHasMore((currentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
    }, [currentPage]);

    useEffect(() => {
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const length = await getLength({format, apiLoad, filters, groupBy});
                if (data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(currentPage+1)
                    setHasMore(((currentPage+1) * pageSize + pageSize) < length)
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector(`#${loadMoreId}`);
        if (target && !usePagination) observer.observe(target);
        if (target && usePagination) observer.unobserve(target); // unobserve if using pagination

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [format, loadMoreId, data.length, usePagination]);
    // =========================================== get data end ========================================================

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;
        // notNull passed through controls. setup length and data fns to use it in both edit and view
        const view_id = typeof view === 'object' ? view.id : view;
        const version = typeof view === 'object' ? (view.name || view.version) : view;
        onChange(JSON.stringify({
            visibleAttributes, pageSize, attributes,
            customColNames, orderBy, colSizes, filters,
            groupBy, fn, notNull, allowEditInView, format,
            view, actions, allowSearchParams, loadMoreId, striped, showTotal, usePagination, allowDownload,
            colJustify, formatFn, fontSize, linkCols,
            data,
            attributionData: {source_id: format?.id, view_id, version}
        }));
    }, [visibleAttributes, pageSize, attributes, customColNames,
        orderBy, colSizes, filters, groupBy, fn, notNull, allowEditInView,
        format, view, actions, allowSearchParams, loadMoreId, striped, showTotal, usePagination, allowDownload,
        colJustify, formatFn, fontSize, linkCols,
        data])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
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
        setData([...data, newItem]);
        return apiUpdate({data: newItem, config: {format}}) && setNewItem({})
    }

    const removeItem = item => {
        setData(data.filter(d => d.id !== item.id))
        return apiUpdate({data: item, config: {format}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================

    // render form selector if no config is passed.
    if(!format?.config && !format?.metadata?.columns) return (
        <div className={'p-1'}>
            Form data not available. Please make a selection:
            <FormsSelector apiLoad={apiLoad} app={pageFormat?.app}
                           format={format} setFormat={setFormat}
                           view={view} setView={setView}
                           formatFromProps={formatFromProps}
                           setVisibleAttributes={setVisibleAttributes}
            />
        </div>
    )

    return (
        <div className={'w-full h-full'}>
            {
                showChangeFormatModal ?
                    <FormsSelector apiLoad={apiLoad} app={pageFormat?.app}
                                   format={format} setFormat={setFormat}
                                   view={view} setView={setView}
                                   formatFromProps={formatFromProps}
                                   setVisibleAttributes={setVisibleAttributes}
                    /> : null
            }
            {
                isEdit ?
                    <ColumnControls attributes={attributes} setAttributes={setAttributes}
                                    visibleAttributes={visibleAttributes} setVisibleAttributes={setVisibleAttributes}
                                    customColNames={customColNames} setCustomColNames={setCustomColNames}
                                    groupBy={groupBy} setGroupBy={setGroupBy}
                                    fn={fn} setFn={setFn}
                                    notNull={notNull} setNotNull={setNotNull}
                                    filters={filters} setFilters={setFilters}
                                    actions={actions} setActions={setActions}
                                    colJustify={colJustify} setColJustify={setColJustify}
                                    showTotal={showTotal} setShowTotal={setShowTotal}
                                    striped={striped} setStriped={setStriped}
                                    // allowDownload={allowDownload} setAllowDownload={setAllowDownload}
                                    allowEditInView={allowEditInView} setAllowEditInView={setAllowEditInView}
                                    allowSearchParams={allowSearchParams} setAllowSearchParams={setAllowSearchParams}
                                    usePagination={usePagination} setUsePagination={setUsePagination}
                                    pageSize={pageSize} setPageSize={setPageSize}
                    /> : null
            }

            <RenderFilters attributes={attributes} filters={filters} setFilters={setFilters} apiLoad={apiLoad}
                           format={format} delimiter={filterValueDelimiter}/>
            {
                renderCard ? <Card data={data} visibleAttributes={visibleAttributes} attributes={attributes} customColNames={customColNames}/> : (
                    <>
                        {/*Pagination*/}
                        <RenderPagination usePagination={usePagination} totalPages={length} loadedRows={data.length} pageSize={pageSize} currentPage={currentPage}
                                          setCurrentPage={setCurrentPage} visibleAttributes={visibleAttributes}/>

                        <RenderSimple {...{
                            data,
                            setData,
                            visibleAttributes,
                            setVisibleAttributes,
                            attributes,
                            customColNames,
                            isEdit,
                            orderBy,
                            setOrderBy,
                            filters,
                            setFilters,
                            groupBy,
                            updateItem,
                            removeItem,
                            addItem,
                            newItem,
                            setNewItem,
                            colSizes,
                            setColSizes,
                            currentPage,
                            pageSize,
                            loading,
                            loadMoreId,
                            striped,
                            format,
                            showTotal,
                            colJustify, setColJustify,
                            formatFn, setFormatFn,
                            fontSize, setFontSize,
                            linkCols, setLinkCols,
                            usePagination,
                            actions: actions.filter(a => ['edit only', 'both'].includes(a.display)),
                            allowEdit: !groupBy.length
                        }} />
                    </>
                )
            }
            {/*Attribution*/}
            <RenderAttribution format={format} view={view} />
        </div>
    )
}

const View = ({value, onChange, size, format:formatFromProps, apiLoad, apiUpdate, renderCard, ...rest}) => {
    const isEdit = false;
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [length, setLength] = useState(cachedData.length || 0);
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [filters, setFilters] = useState(cachedData.filters || []);

    const [newItem, setNewItem] = useState({})
    const [data, setData] = useState(cachedData.data || []);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);

    const view = cachedData.view;
    const attributes = cachedData.attributes;
    const visibleAttributes = cachedData.visibleAttributes || [];
    const customColNames = cachedData.customColNames || {};
    const groupBy = cachedData.groupBy || [];
    const notNull = cachedData.notNull || [];
    const actions = cachedData.actions || [];
    const colJustify = cachedData.colJustify || {};
    const formatFn = cachedData.formatFn || {};
    const fontSize = cachedData.fontSize || {};
    const linkCols = cachedData.linkCols || {};
    const fn = cachedData.fn;
    const allowEdit = cachedData.allowEditInView;
    const allowSearchParams = cachedData.allowSearchParams;
    const pageSize = cachedData.pageSize || 5;
    const showTotal = cachedData.showTotal;
    const striped = cachedData.striped;
    const allowDownload = cachedData.allowDownload;
    const allowEditInView = cachedData.allowEditInView;
    const usePagination = cachedData.usePagination;
    
    const filterValueDelimiter = '|||'
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams(window.location.search);

    const loadMoreId = cachedData.loadMoreId;
    // const isInitialRender = useRef(true);

    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);

    // ========================================= filters begin =========================================================
    useEffect(() => {
        if(!allowSearchParams) return;

        // if filters === cachedData.filters, and search params exist, avoid navigating
        // the only time you should navigate is when filters change.
        // the state variable will change before cachedData, this is one way to detect if this useEffect is being called
        // on init values. Though navigation should happen on init values if search params don't exist.
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));

        const urlMatchesFilters = isEqual(filtersFromURL, filters);
        const filtersMatchSavedFilters = isEqual(filters, cachedData.filters);
        if(filtersMatchSavedFilters && filtersFromURL.length) return;

        const url = convertToUrlParams(filters, filterValueDelimiter); // url based on current filters

        // this triggers and the old filters (from cached data) take over.
        if(url.length && url !== window.location.search.replace('?', '') || (!url.length && !filters.length)) {
            // console.log('debugging: navigating to url 2', url, window.location.search.replace('?', ''))
            navigate(`?${url}`)
        }

    }, [allowSearchParams, filters]);

    useEffect(() => {
        if(!allowSearchParams) return;
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));
        if(filtersFromURL.length) {
            setLoading(true)
            // if filters !== url search params, set filters. no need to navigate.
            setFilters(oldFilters => {
                const newFilters = [
                    ...new Set([
                        ...(filtersFromURL.filter(f => f.column).map(f => f.column)),
                        ...(oldFilters.filter(f => f.column).map(f => f.column))
                        ])
                ].map(column => ({
                    column,
                    values: [...new Set(
                        [
                            ...((oldFilters || []).find(f => f.column === column)?.values || []),
                            ...((filtersFromURL || []).find(f => f.column === column)?.values || []),
                        ].filter(f => f)
                    )],
                    valueSets: (oldFilters || []).find(f => f.column === column)?.valueSets
                }))
                console.log('new filters on load', oldFilters, newFilters)
                return newFilters
            })
            setLength(undefined)
            setHasMore(false)
            setLoading(false)
        }
    }, [allowSearchParams, searchParams]);
    // ========================================= filters end ===========================================================

    useEffect(() => {
        async function load() {
            if(data?.length || (!format.config && !format?.metadata?.columns)) return;
            // init stuff
            setLoading(true)
            console.log('calling 1', filters)
            const length = await getLength({format, apiLoad, filters, groupBy, notNull});
            const d = await getData({
                format, apiLoad, currentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            setData(d);
            setLength(length);
            setLoading(false)
        }

        load()
    }, [format])
    // ========================================== init comp end ========================================================

    // ========================================== get data begin =======================================================
    useEffect(() => {
        // only run when controls change
        let isCancelled = false;
        async function load() {
            if(!format?.config && !format?.metadata?.columns) return;
            setLoading(true)
            console.log('calling 2', filters)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const length = await getLength({format, apiLoad, filters, groupBy, notNull});
            if (isCancelled) return;
            const data = await getData({
                format, apiLoad, currentPage: newCurrentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            if (isCancelled) return;

            // only set data if fetched from the most recent change
            setLength(length);
            setData(data); // if page didn't change, set data as it comes
            setCurrentPage(newCurrentPage);
            setHasMore((newCurrentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
        return () => {
            isCancelled = true;
        };
    }, [orderBy, filters]);

    useEffect(() => {
        // only run when page changes

        async function load() {
            if(!format?.config && !format?.metadata?.columns) return;
            setLoading(true)
            console.log('calling 3', filters)
            const length = await getLength({format, apiLoad, filters, groupBy});
            const data = await getData({
                format, apiLoad, currentPage, pageSize, length, orderBy, filters, groupBy, visibleAttributes, fn, notNull, showTotal
            });
            // setLength(length);
            setData(prevData => currentPage > 0 && !usePagination ? [...prevData.filter(r => !r.totalRow), ...data] : data); // on page change append unless using pagination
            setHasMore((currentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
    }, [currentPage]);

    useEffect(() => {
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const length = await getLength({format, apiLoad, filters, groupBy});

                if (data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(currentPage+1)
                    setHasMore(((currentPage+1) * pageSize + pageSize) < length)
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector(`#${loadMoreId}`);
        if (target && !usePagination) observer.observe(target);
        if (target && usePagination) observer.unobserve(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [format, loadMoreId, data.length]);
    // =========================================== get data end ========================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
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
        setData([...data, newItem]);
        return apiUpdate({data: newItem, config: {format}}) && setNewItem({})
    }

    const removeItem = item => {
        setData(data.filter(d => d.id !== item.id))
        return apiUpdate({data: item, config: {format}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================
    if(!format?.config && !format?.metadata?.columns) return <div className={'p-1 text-center'}>Form data not available.</div>
    return renderCard ? <Card data={data} visibleAttributes={visibleAttributes} attributes={attributes} customColNames={customColNames}/> : (
        <div className={'w-full'}>
            <RenderFilters attributes={attributes} filters={filters} setFilters={setFilters} apiLoad={apiLoad} format={format} delimiter={filterValueDelimiter}/>
            {
                        <RenderSimple {...{
                            data,
                            setData,
                            visibleAttributes,
                            attributes,
                            customColNames,
                            isEdit,
                            orderBy,
                            setOrderBy,
                            filters,
                            setFilters,
                            groupBy,
                            updateItem,
                            removeItem,
                            addItem,
                            newItem,
                            setNewItem,
                            colSizes,
                            setColSizes,
                            currentPage,
                            pageSize,
                            loading,
                            loadMoreId,
                            striped,
                            format,
                            colJustify,
                            formatFn,
                            fontSize,
                            showTotal,
                            linkCols,
                            allowEdit: groupBy.length ? false : allowEdit,
                            actions: actions.filter(a => ['view only', 'both'].includes(a.display))
                        }} />
            }
           <div className={'flex justify-between'}>
               {/*Attribution*/}
               <RenderAttribution format={format} view={view} />
               {/*Pagination*/}
               <RenderPagination usePagination={usePagination} totalPages={length} loadedRows={data.length} pageSize={pageSize} currentPage={currentPage}
                                 setCurrentPage={setCurrentPage} visibleAttributes={visibleAttributes}/>
           </div>
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
    "variables": [
        {name: 'visibleAttributes', hidden: true}, {name: 'pageSize', hidden: true}, {name: 'attributes', hidden: true},
        {name: 'customColNames', hidden: true}, {name: 'orderBy', hidden: true}, {name: 'colSizes', hidden: true}, {name: 'filters'},
        {name: 'groupBy', hidden: true}, {name: 'fn', hidden: true}, {name: 'notNull', hidden: true}, {name: 'allowEditInView', hidden: true}, {name: 'format', hidden: true},
        {name: 'view', hidden: true}, {name: 'actions', hidden: true}, {name: 'allowSearchParams', hidden: true}, {name: 'loadMoreId', hidden: true},
        {name: 'attributionData', hidden: true}
    ],
    getData: init,
    "EditComp": Edit,
    "ViewComp": View
}