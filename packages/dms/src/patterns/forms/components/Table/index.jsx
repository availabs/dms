import React from 'react'
import {
    useFilters,
    useGlobalFilter,
    useSortBy,
    useTable,
    usePagination,
    useExpanded
} from 'react-table'
// import Loading from '../Loading';
// import {Button} from "../Button"
// import {Select} from "../Inputs"
import { get } from "lodash-es"
import {matchSorter} from 'match-sorter'
import {useState, useEffect} from "react";
import {useCallback, useMemo} from 'react';
// import {useTheme} from "../../wrappers"
import {DefaultColumnFilter} from "./components/DefaultColumnFIlter";
import {DropDownColumnFilter} from "./components/DropDownColumnFilter"
import {fuzzyTextFilterFn} from "./utils/fuzzyTextFilterFn";
import {DropDownFilterFn} from "./utils/dropdownFilterFn";
import {getPageSpread} from "./utils/getPageSpread";
import {DefaultExpandedRow} from "./components/DefaultExpandedRow";
import {Pagination} from "./components/Pagination";
import {RenderExpandedRow} from "./components/RenderExpandedRow";
import {RenderCell} from "./components/RenderCell";
import {CSVLink} from "react-csv";

const EMPTY_ARRAY = [];
const Loading = () => <div>Loading...</div>;

export default ({
    columns = EMPTY_ARRAY,
    data = EMPTY_ARRAY,
    sortBy, sortOrder = "",
    initialPageSize = 10,
    manualPagination, // manual pagination, provide data if not providing fetchData fn
    fetchData, // manual pagination, fetch data using this function
    onPageChange, // custom function to execute
    numRecords, // should be used in case of manual pagination
    manualCurrentPage,
    pageSize = 5,
    onRowClick,
    onRowEnter,
    onRowLeave,
    ExpandRow = DefaultExpandedRow,
    disableFilters = false,
    disableSortBy = false,
    csvDownload = false,
    onCsvDownload,
    themeOptions = {},
    theme = {},
    ...props
}) => {
    const [pageData, setPageData] = React.useState(data || []);
    const [totalRecords, setTotalRecords] = React.useState(numRecords || 0);
    const [currentPage, setCurrentPage] = useState(manualCurrentPage || 0);
    const [pageValue, setPageValue] = useState(0);
    const [loading, setLoading] = useState(false);

    const filterTypes = React.useMemo(
        () => ({
            fuzzyText: fuzzyTextFilterFn, dropdown: DropDownFilterFn
        }), []
    );

    const filters = React.useMemo(
        () => ({
            dropdown: DropDownColumnFilter,
            text: DefaultColumnFilter
        }), []
    );

    const defaultColumn = React.useMemo(
        () => ({Filter: false}), []
    );

    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        page,
        rows,
        preFilteredRows,
        prepareRow,
        canPreviousPage,
        canNextPage,
        gotoPage,
        previousPage,
        nextPage,
        pageCount,
        visibleColumns,
        toggleRowExpanded,
        setPageSize,
        state: {
            pageSize: statePageSize,
            pageIndex,
            expanded
        }
    } = useTable(
        {
            columns,
            data: pageData, // changes needed here
            manualPagination: Boolean(manualPagination) || Boolean(fetchData),
            ...(Boolean(fetchData) || Boolean(manualPagination)) && {pageCount: Math.ceil(totalRecords / pageSize)},
            defaultColumn,
            filterTypes,
            disableFilters,
            disableSortBy,
            initialState: {
                pageSize: +pageSize || +initialPageSize,
                ...sortBy && {sortBy: [{id: sortBy, desc: sortOrder.toLowerCase() === "desc"}]}
            }
        },
        useFilters,
        useGlobalFilter,
        useSortBy,
        useExpanded,
        usePagination
    );

    React.useEffect(() => {
        if ((pageSize !== null) && (pageSize !== statePageSize)) {
            setPageSize(+pageSize);
        }
    }, [pageSize, statePageSize, setPageSize]);

    React.useEffect(() => {
        if (fetchData) {
            const appData1 = async () => {
                setLoading(true);

                const {data, length} = await fetchData({currentPage, pageSize});
                return {data, length};
            };

            appData1().then((result) => {
                setPageData(result?.data || []);
                setTotalRecords(result?.length || 0);
                setLoading(false);
            });
        }
    }, [fetchData, pageSize, currentPage]);

    React.useEffect(() => {
        if (!fetchData) {
            setPageData(data)
        }
    }, [data, pageCount, fetchData])

    React.useEffect(() => {
        if (!fetchData && totalRecords !== numRecords) {
            setTotalRecords(numRecords)
        }
    }, [numRecords])

    React.useEffect(() => {
        setPageValue(fetchData || manualPagination ? currentPage : pageIndex)
    }, [pageIndex, currentPage]);

    // pagination utils
    const onNextPage = useCallback(() => {
        setCurrentPage((prevPage) => prevPage + 1);
        onPageChange(currentPage + 1)
    }, []);
    const onPrevPage = useCallback(() => {
        setCurrentPage((prevPage) => prevPage - 1);
        onPageChange(currentPage - 1)
    }, []);

    const onPageSelect = useCallback((pageNo) => {
            if (currentPage !== pageNo) {
                setCurrentPage(pageNo);
            }
            onPageChange(pageNo)
        },
        [currentPage]
    );

    if (!(columns.length && pageData.length)) return null;

    if (!preFilteredRows.length) return null;

    return (
        <div className='w-full'>
            <div className="overflow-auto scrollbar-sm">
                {loading &&
                    <div className={'z-10 absolute float-center text-center align-middle items-center w-full'}
                      style={{
                          backgroundColor: 'rgba(255,255,255,0.38)',
                          // height: '75%',
                          width: '100%',
                    }}>
                    <Loading width={'100%'} height={'100%'}/>
                </div>}
                {
                    csvDownload ?
                        <div className={'w-full text-right'}>
                            <CSVLink
                                data={pageData}
                                headers={columns.map(c => ({label: c.Header, key: c.accessor}))}
                                filename={'data.csv'}
                                className={theme.downloadWrapper}
                            >
                                <i className={theme.downloadIcon || 'fa fa-download'} /> <label>csv</label>
                            </CSVLink>
                        </div> : null
                }
                <table {...getTableProps()} className="w-full">
                <thead>
                    {headerGroups.map(headerGroup =>
                        <tr {...headerGroup.getHeaderGroupProps()}>
                            {headerGroup.headers
                                .map(column =>
                                    <th {...column.getHeaderProps({
                                        ...column.getSortByToggleProps(),
                                        style: {
                                            minWidth: column.minWidth,
                                            width: column.width,
                                            maxWidth: column.maxWidth
                                        },
                                    })}
                                        className={theme.tableHeader}>
                                        <div className={'flex flex-col'}>
                                            <div className={`flex justify-between items-center`}>
                                                <div className="flex-1 pr-1">
                                                    {column.render("Header")}
                                                </div>
                                                <>
                                                    {
                                                        column.info &&
                                                        <i
                                                            className={`${theme.infoIcon}`}
                                                            title={column.info}
                                                        />
                                                    }
                                                    {!column.canSort ? null :
                                                        !column.isSorted ?
                                                            <i className={`ml-2 pt-1 ${theme.sortIconIdeal}`}/> :
                                                            column.isSortedDesc ?
                                                                <i className={`ml-2 pt-1 ${theme.sortIconDown}`}/> :
                                                                <i className={`ml-2 pt-1 ${theme.sortIconUp}`}/>
                                                    }
                                                </>
                                            </div>
                                            <div>
                                                {!column.canFilter ? null :
                                                    <div>{column.render(filters[column.filter] || 'Filter')}</div>}
                                            </div>
                                        </div>
                                    </th>
                                )
                            }
                        </tr>
                    )
                    }

                    </thead>
                    <tbody {...getTableBodyProps()}>
                    {page.map((row) => {
                        const {onClick, expand = []} = row.original;
                        prepareRow(row);
                        return (
                            <React.Fragment key={row.getRowProps().key}>
                                <tr {...row.getRowProps()}
                                    onMouseEnter={typeof onRowEnter === "function" ? e => onRowEnter(e, row) : null}
                                    onMouseLeave={typeof onRowLeave === "function" ? e => onRowLeave(e, row) : null}
                                    className={`
                                        ${props.striped ? theme.tableRowStriped : theme.tableRow}
                                        ${(onClick || onRowClick) ? "cursor-pointer" : ""}
                                    `}
                                    onClick={e => {
                                        (typeof onRowClick === "function") && onRowClick(e, row);
                                        (typeof onClick === "function") && onClick(e, row);
                                    }}>
                                    {row.cells.map((cell, ii) =>
                                        <RenderCell
                                            key ={ii}
                                            {...{
                                                ii, cell, row, columns,
                                                expand, expanded, toggleRowExpanded,
                                                theme
                                            }}
                                        />
                                    )
                                    }
                                </tr>
                                <RenderExpandedRow {...{row, expand, visibleColumns, ExpandRow, theme}} />
                            </React.Fragment>
                        )
                    })
                    }

                    </tbody>
                </table>
            </div>

            <div className='w-full p-2'>
                <Pagination
                    {...{
                        fetchData, manualPagination, theme,
                        pageValue, pageCount, pageSize, pageIndex,
                        statePageSize, totalRecords, rows,
                        canNextPage,
                        onPageSelect, onPrevPage, onNextPage,
                        previousPage, gotoPage, nextPage,
                        onPageChange
                    }}
                />
            </div>
        </div>
    )
}