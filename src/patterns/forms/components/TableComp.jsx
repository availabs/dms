import {Link, useNavigate, useParams} from "react-router-dom";
import React, {useEffect, useState} from "react";
import {getData} from "../utils/getData";
import {FilterSelector} from "./filterSelector";
import {DownloadModal} from "./download";

import { fnum } from "~/utils/macros.jsx";
import {RenderColumnControls} from "~/component_registry/shared/columnControls.jsx";
import {ButtonSelector} from "~/component_registry/shared/buttonSelector.jsx";
import {Loading} from "~/utils/loading.jsx";
import {falcor} from "~/modules/avl-falcor"
import {pgEnv} from "~/utils/";
import {Table} from "~/modules/avl-components/src"
import {getColAccessor} from "../utils/getColAccesor";


const mapColName = (columns, col) => columns.find(c => c.name === col)?.accessor;
const getNestedValue = (obj) => typeof obj?.value === 'object' ? getNestedValue(obj.value) : obj?.value || obj;

export const TableComp = ({format, baseUrl, app, type, ...rest}) => {
    const navigate = useNavigate();
    const params = useParams();
    const cachedData = rest;
    const [loading, setLoading] = useState(false);
    const [geoAttribute, setGeoAttribute] = useState(cachedData?.geoAttribute);
    const [metaLookupByViewId, setMetaLookupByViewId] = useState(cachedData.metaLookupByViewId || {});
    const [geoid, setGeoid] = useState(cachedData?.geoid || '36');
    const [filters, setFilters] = useState(cachedData?.filters || {});
    const [filterValue, setFilterValue] = useState(cachedData?.filterValue || {});
    const [visibleCols, setVisibleCols] = useState(cachedData?.columns || ['action_name', 'status']);
    const [pageSize, setPageSize] = useState(cachedData?.pageSize || 10);
    const [sortBy, setSortBy] = useState(cachedData?.sortBy || {});
    const [groupBy, setGroupBy] = useState(cachedData?.groupBy || []);
    const [notNull, setNotNull] = useState(cachedData?.notNull || []);
    const [fn, setFn] = useState(cachedData?.fn || []);
    const [actionType, setActionType] = useState(cachedData?.actionType || 'shmp')
    const [formsConfig, setFormsConfig] = useState(format);
    const [hiddenCols, setHiddenCols] = useState(cachedData?.hiddenCols || []);
    const [colSizes, setColSizes] = useState(cachedData?.colSizes || {});
    const [data, setData] = useState(cachedData.data || [])
    const [displaySettings, setDisplaySettings] = useState(false);
    const [displayDownload, setDisplayDownload] = useState(false);
    const [manualFilters, setManualFilters] = useState({}); // {col-name:[]}

    const actionButtonClass = 'px-2 py-0.5 m-1 border border-blue-300 hover:bg-blue-600 text-sm text-blue-500 hover:text-white rounded-md transition ease-in shadow';

    useEffect(() => {
        setLoading(true)
        getData({
            formsConfig,
            actionType,
            metaLookupByViewId,
            setMetaLookupByViewId,
            visibleCols,
            pgEnv,
            geoid,
            geoAttribute,
            pageSize, sortBy, groupBy, fn, notNull, colSizes,
            filters, filterValue, hiddenCols,
            setData
        }, falcor);
        setLoading(false)
    }, [formsConfig, actionType,
        geoAttribute, geoid, metaLookupByViewId,
        pageSize, sortBy, groupBy, fn, notNull, colSizes,
        filters, filterValue, visibleCols, hiddenCols]);


    const columns = visibleCols
        .map(c => formsConfig?.attributes?.find(md => md.name === c))
        .filter(c => c && !c.openOut && !hiddenCols.includes(c.name))
        .map(col => {
            const acc = getColAccessor(fn, col.name, col.origin);
            return {
                Header: col.display_name,
                accessor: acc,
                Cell: cell => {
                    let value = getNestedValue(cell.value);
                    value =
                        ['integer', 'number'].includes(cell.column.type) ?
                            fnum(value || 0, col.isDollar) :
                            Array.isArray(value) ? value.join(', ') : value
                    if(typeof value === 'object') return  <div></div>
                    return( <div>{value}</div>);
                },
                align: col.align || 'right',
                width: colSizes[col.name] || '15%',
                filter: col.filter || filters[col.display_name],
                info: col.desc,
                ...col,
                type: fn[col.display_name]?.includes('array_to_string') ? 'string' : col.type
            }
        });

    const uniqueValues = columns.reduce((acc, column) => ({
        ...acc,
        [column.accessor]: [...new Set(data.map(d => d[column.accessor]))]
    }), {})

    const sortColRaw = columns.find(c => c.name === Object.keys(sortBy)?.[0])?.accessor;

    const filteredData = data.filter(row =>
        !Object.keys(filterValue || {}).length ||
        Object.keys(filterValue)
            .reduce((acc, col) => {
                const mappedName = mapColName(columns, col)
                const value = getNestedValue(row[mappedName]);
                return acc && value?.toString().toLowerCase().includes(filterValue[col]?.toLowerCase())
            }, true))
        .filter(row => {
            return !Object.keys(manualFilters)?.length ||
                Object.keys(manualFilters).reduce((acc, filterCol) => acc && manualFilters[filterCol]?.includes(row[filterCol]), true)
        })

    return <>
        <div className={'w-full p-2 my-2 flex justify-end items-center font-semibold'}>
            <div className={'flex items-center px-2 text-blue-300 hover:text-blue-600 transition ease-in'}
                 title={'Download'}
                 onClick={e => setDisplayDownload(!displayDownload)}
            >
                <i className={'fa fa-download text-lg px-1'} />
                <label className={'text-sm'}>Download</label>
            </div>
            <div className={`flex items-center px-2 ${displaySettings ? `text-red-300 hover:text-red-500` : `text-blue-300 hover:text-blue-600`} transition ease-in`}
                 title={displaySettings ? 'Close Settings' : 'Open Settings'}
                 onClick={e => setDisplaySettings(!displaySettings)}
            >
                <i className={displaySettings ? 'fa fa-close text-lg px-1' : 'fa fa-gear text-lg px-1'}/>
                <label className={'text-sm'}>{displaySettings ? 'Close Settings' : 'Open Settings'}</label>
            </div>
        </div>
        <div className={`${displaySettings ? 'block' : 'hidden'} border rounded-md border-blue-600 bg-blue-50 p-2`}>
            <RenderColumnControls
                cols={formsConfig?.attributes?.filter(c => ['data-variable', 'meta-variable', 'geoid-variable'].includes(c.display))?.map(c => c.name)}
                metadata={formsConfig?.attributes}
                stateNamePreferences={{
                    sortBy: 'original',
                    hideCols: 'original',
                    showTotal: 'original'
                }}
                visibleCols={visibleCols}
                setVisibleCols={setVisibleCols}
            />

            <FilterSelector
                filters={manualFilters}
                setFilters={setManualFilters}
                columns={columns}
                uniqueValues={uniqueValues}
            />
        </div>

        <DownloadModal
            displayDownload={displayDownload}
            setDisplayDownload={setDisplayDownload}
            visibleCols={visibleCols}
            columns={formsConfig?.attributes?.filter(c => ['data-variable', 'meta-variable', 'geoid-variable'].includes(c.display))}
            data={data}
            filteredData={filteredData}

            formsConfig={formsConfig}
            actionType={actionType}
            metaLookupByViewId={metaLookupByViewId}
            setMetaLookupByViewId={setMetaLookupByViewId}
            pgEnv={pgEnv}
            geoid={geoid}
            geoAttribute={geoAttribute}
            pageSize={pageSize} sortBy={sortBy} groupBy={groupBy} fn={fn} notNull={notNull} colSizes={colSizes}
            filters={filters} filterValue={filterValue} manualFilters={manualFilters} hiddenCols={hiddenCols}
            falcor={falcor}
            getNestedValue={getNestedValue}
        />

        {
            loading ? <Loading/> :
                <Table data={filteredData} // filter data from fromIndex
                       columns={[
                           ...columns,
                           {
                               Header: ' ',
                               accessor: 'edit',
                               Cell: d => {
                                   return (
                                       <div className={'flex flex-row flex-wrap justify-between'}>
                                           <Link
                                               className={actionButtonClass}
                                               to={`${baseUrl}view/${d?.cell?.row?.original?.id}`}> view </Link>
                                           <Link
                                               className={actionButtonClass}
                                               to={`${baseUrl}edit/${d?.cell?.row?.original?.id}`}> edit </Link>
                                       </div>
                                   )
                               },
                               width: '3%'
                           }]}
                       initialPageSize={pageSize}
                       pageSize={pageSize}
                       sortBy={sortColRaw}
                       sortOrder={Object.values(sortBy)?.[0] || 'asc'}
                />
        }
    </>
}