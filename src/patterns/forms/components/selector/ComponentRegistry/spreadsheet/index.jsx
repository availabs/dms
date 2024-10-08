import React, { useMemo, useState, useEffect }from 'react'
import RenderColumnControls from "./components/RenderColumnControls";
import RenderFilterControls from "./components/RenderFilterControls";
import {RenderSimple} from "./components/SimpleSpreadsheet";
import {RenderPagination} from "./components/RenderPagination";
import {isJson, getLength, getData, convertToUrlParams} from "./utils";
import {RenderFilters} from "./components/RenderFilters";
import {useSearchParams, useNavigate} from "react-router-dom";
import RenderSwitch from "./components/Switch";

const getConfig = ({
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

const getForms = async ({app, siteType, apiLoad}) => {
    const siteConfig = getConfig({
        app,
        type: siteType,
    })

    // these are the patterns which are in the site.
    // there may be deleted patterns which are not in the site.patterns array. don't wanna show them :shrug:

    const siteData = await apiLoad(siteConfig);

    // these are the patterns which are in the site.
    // there may be deleted patterns which are not in the site.patterns array. don't wanna show them :shrug:
    const existingPatterns = (siteData?.[0]?.data?.value?.patterns || []).map(p => p.id)

    const config = getConfig({
        app,
        type: 'pattern',
        filter: {[`data->>'pattern_type'`]: ['form'], id: existingPatterns}
    })
    return await apiLoad(config);

}

const RenderFormsSelector = ({app, siteType, formatFromProps, format, setFormat, apiLoad}) => {
    const [forms, setForms] = useState([]);
    console.log('props passed', app, siteType, formatFromProps, format)
    if(formatFromProps?.config) return null;

    useEffect(() => {
        getForms({app, siteType, apiLoad}).then(data => setForms((data || [])));
        }, []);
    console.log('forms', format)
    return (
        <select
            className={'p-1 w-full bg-white border'}
            value={JSON.stringify(format)}
            onChange={e => {
                console.log('val', e.target.value)
                const tmpFormat = JSON.parse(e.target.value || '{}');
                // add type, as we only get doc_type here.
                setFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
            }}
        >
            <option key={'default'} value={undefined}>Please Select a form</option>
            {
                forms.map(form => <option key={form?.data?.value.doc_type} value={JSON.stringify(form?.data?.value || {})}>{form?.data?.value.doc_type}</option>)
            }

        </select>
    )
}
const Edit = ({value, onChange, size, format: formatFromProps, pageFormat, apiLoad, apiUpdate, siteType, ...rest}) => {
    const isEdit = Boolean(onChange);
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [showChangeFormatModal, setShowChangeFormatModal] = useState(!formatFromProps); // if you don't get format from props, default set to true
    const [length, setLength] = useState(cachedData.length || 0);
    const [data, setData] = useState([]);
    const [hasMore, setHasMore] = useState();
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState([]);
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData.visibleAttributes || []);
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [newItem, setNewItem] = useState({})
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [filters, setFilters] = useState(cachedData.filters || []);
    const [allowEditInView, setAllowEditInView] = useState(cachedData.allowEditInView);
    const [currentPage, setCurrentPage] = useState(0);
    const pageSize = 500// cachedData.pageSize || 5;
    const filterValueDelimiter = '|||'
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // ========================================= init comp begin =======================================================
    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);
    useEffect(() => {
        setAttributes(JSON.parse(format?.config || '{}')?.attributes || [])
    }, [format]);
    useEffect(() => setColSizes({}), [size]); // on size change, reset column sizes.
    // useEffect(() => setLength(data.length), [data]); // on data change, reset length.
    // ========================================= filters 1/2 begin======================================================
    useEffect(() => {
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));
        if(filtersFromURL.length) {
            setFilters(filtersFromURL)
            const url = `?${convertToUrlParams(filters, filterValueDelimiter)}`;
            if(url !== window.location.search) navigate(url);
        }else if(!filtersFromURL.length && filters.length){
            // this means url didn't keep url params. so we need to navigate
            const url = `?${convertToUrlParams(filters, filterValueDelimiter)}`;
            navigate(url)
        }
    }, [searchParams]);
    // ========================================= filters 1/2 end =======================================================
    useEffect(() => {
        async function load() {
            if(data?.length || !format?.config) return;
            // init stuff
            setLoading(true)
            const length = await getLength({format, apiLoad, filters});
            const d = await getData({format, apiLoad, currentPage, pageSize, length, orderBy, filters});
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
            if(!format?.config) return;
            setLoading(true)
            const length = await getLength({format, apiLoad, filters});
            const data = await getData({format, apiLoad, currentPage, pageSize, length, orderBy, filters});
            setLength(length);
            setData(data);
            setHasMore((currentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
    }, [format, orderBy, filters]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            async (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    const data = await getData({format, apiLoad, currentPage: currentPage+1, pageSize, length, orderBy, filters});
                    setCurrentPage(currentPage+1)
                    setData(prevData => [...prevData, ...data])
                    setHasMore((currentPage * pageSize + pageSize) < length)
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector('#loadMoreTrigger');
        if (target) observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [format, data, loading]);
    // =========================================== get data end ========================================================

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;

        onChange(JSON.stringify({visibleAttributes, pageSize, attributes, orderBy, colSizes, filters, allowEditInView, format}));
    }, [visibleAttributes, attributes, orderBy, colSizes, filters, allowEditInView, format])
    // =========================================== saving settings end =================================================

    // =========================================== filters 2/2 begin ===================================================
    useEffect(() => {
        const url = `?${convertToUrlParams(filters, filterValueDelimiter)}`;
        navigate(url)
    }, [filters]);
    // =========================================== filters 2/2 end ===================================================

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
    if(!format?.config) return (
        <div className={'p-1 flex'}>
            Form data not available. Please make a selection:
            <RenderFormsSelector siteType={siteType} apiLoad={apiLoad} app={pageFormat.app} format={format} setFormat={setFormat} formatFromProps={formatFromProps} />
        </div>
    )

    return (
        <div className={'w-full h-full'}>
            {
                isEdit &&
                <div className={'flex'}>
                    <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                                          visibleAttributes={visibleAttributes}
                                          setVisibleAttributes={setVisibleAttributes}/>
                    <RenderFilterControls attributes={attributes} visibleAttributes={visibleAttributes}
                                          filters={filters} setFilters={setFilters} delimiter={filterValueDelimiter}
                                          navigate={navigate}
                    />

                    <div>
                        <div
                             className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 bg-white hover:bg-gray-50 cursor-pointer`}
                             onClick={() => setAllowEditInView(!allowEditInView)}
                        >
                            <span className={'flex-1 select-none mr-1'}>Allow Edit </span>
                            <RenderSwitch
                                size={'small'}
                                enabled={allowEditInView}
                                setEnabled={() => {}}
                            />
                        </div>
                    </div>

                    <div>
                        <div
                             className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 bg-white hover:bg-gray-50 cursor-pointer`}
                             onClick={() => setShowChangeFormatModal(!showChangeFormatModal)}
                        >
                            <span className={'flex-1 select-none mr-1'}>show set format modal </span>
                            <RenderSwitch
                                size={'small'}
                                enabled={showChangeFormatModal}
                                setEnabled={() => {}}
                            />
                        </div>
                    </div>
                </div>
            }

            {
                showChangeFormatModal ?
                    <RenderFormsSelector siteType={siteType} apiLoad={apiLoad} app={pageFormat.app} format={format} setFormat={setFormat} formatFromProps={formatFromProps} /> : null
            }

            <RenderFilters attributes={attributes} filters={filters} setFilters={setFilters} apiLoad={apiLoad}
                           format={format} delimiter={filterValueDelimiter}/>
            {/*Pagination*/}
            <RenderPagination totalPages={length} loadedRows={data.length} pageSize={pageSize} currentPage={currentPage}
                              setVCurrentPage={setCurrentPage} visibleAttributes={visibleAttributes}/>
            {
                <RenderSimple {...{
                    data,
                    setData,
                    visibleAttributes,
                    setVisibleAttributes,
                    attributes,
                    isEdit,
                    orderBy,
                    setOrderBy,
                    filters,
                    setFilters,
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
                    allowEdit: true
                        }} />
            }
        </div>
    )
}

const View = ({value, onChange, size, format:formatFromProps, apiLoad, apiUpdate, ...rest}) => {
    const isEdit = false;
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [length, setLength] = useState(cachedData.length || 0);
    const [colSizes, setColSizes] = useState(cachedData.colSizes || {});
    const [orderBy, setOrderBy] = useState(cachedData.orderBy || {});
    const [filters, setFilters] = useState(cachedData.filters || []);

    const [newItem, setNewItem] = useState({})
    const [data, setData] = useState([]);
    const [hasMore, setHasMore] = useState();
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);

    const attributes = cachedData.attributes;
    const visibleAttributes = cachedData.visibleAttributes || [];
    const allowEdit = cachedData.allowEditInView;
    const pageSize = 500// cachedData.pageSize || 5;
    const filterValueDelimiter = '|||'
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams(window.location.search);
    // useEffect(() => setLength(data.length), [data]); // on data change, reset length.

    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);
    // ========================================= filters 1/2 begin======================================================
    useEffect(() => {
        const filterCols = Array.from(searchParams.keys());
        const filtersFromURL = filterCols.map(col => ({column: col, values: searchParams.get(col)?.split(filterValueDelimiter)}));
        if(filtersFromURL.length) {
            setFilters(filtersFromURL)
            const url = `?${convertToUrlParams(filters, filterValueDelimiter)}`;
            if(url !== window.location.search) {
                navigate(url);
            }
        }else if(!filtersFromURL.length && filters.length){
            // this means url didn't keep url params. so we need to navigate
            const url = `?${convertToUrlParams(filters, filterValueDelimiter)}`;
            navigate(url)
        }
    }, [searchParams]);
    // ========================================= filters 1/2 end =======================================================
    useEffect(() => {
        async function load() {
            if(data?.length || !format.config) return;
            // init stuff
            setLoading(true)
            const length = await getLength({format, apiLoad, filters});
            const d = await getData({format, apiLoad, currentPage, pageSize, length, orderBy, filters});
            setData(d);
            setLength(length);
            setLoading(false)
        }

        load()
    }, [format])
    // ========================================== init comp end ========================================================

    // ========================================== get data begin =======================================================
    useEffect(() => {
        // onPageChange
        async function load() {
            if(!format?.config) return;
            setLoading(true)
            const length = await getLength({format, apiLoad, filters});
            const data = await getData({format, apiLoad, currentPage, pageSize, length, orderBy, filters});
            setLength(length);
            setData(data);
            setHasMore((currentPage * pageSize + pageSize) < length)
            setLoading(false)
        }

        load()
    }, [orderBy, filters]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            async (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    const data = await getData({format, apiLoad, currentPage: currentPage+1, pageSize, length, orderBy, filters});
                    setCurrentPage(currentPage+1)
                    setData(prevData => [...prevData, ...data])
                    setHasMore((currentPage * pageSize + pageSize) < length)
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector('#loadMoreTrigger');
        if (target) observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [data, loading]);
    // =========================================== get data end ========================================================

    // =========================================== filters 2/2 begin ===================================================
    useEffect(() => {
        const url = convertToUrlParams(filters, filterValueDelimiter);
        if(url.length && url !== window.location.search.replace('?', '')) {
            navigate(`?${url}`)
        }
    }, [filters]);
    // =========================================== filters 2/2 end ===================================================

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
    if(!format?.config) return <div className={'p-1 text-center'}>Form data not available.</div>
    return (
        <div className={'w-full'}>
            <RenderFilters attributes={attributes} filters={filters} setFilters={setFilters} apiLoad={apiLoad} format={format} delimiter={filterValueDelimiter}/>
            {
                        <RenderSimple {...{
                            data,
                            setData,
                            visibleAttributes,
                            attributes,
                            isEdit,
                            orderBy,
                            setOrderBy,
                            filters,
                            setFilters,
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
                            allowEdit
                        }} />
            }
            {/*Pagination*/}
            <RenderPagination totalPages={length} loadedRows={data.length} pageSize={pageSize} currentPage={currentPage}
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
    "ViewComp": View
}