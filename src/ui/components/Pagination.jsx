import React from "react";
import {tableTheme} from "./table";
import {ThemeContext} from "../useTheme";

export const docs = {
    themeKey: 'table',
    totalLength: 100,
    pageSize: 10,
    usePagination: true,
    currentPage: 0,
    setCurrentPage: () => {}
}

export default function ({totalLength, pageSize, usePagination,
                             currentPage,
    setCurrentPage
                         }) {
    const { theme: themeFromProps  = {} } = React.useContext(ThemeContext) || {};
    const theme = {...themeFromProps, table: {...tableTheme, ...(themeFromProps.table || {})}};

    const rangeSize = 5;
    const totalPages=Math.ceil(totalLength / pageSize);
    const halfRange = Math.floor(rangeSize / 2);

    // Determine the start and end of the range
    let start = Math.max(0, currentPage - halfRange);
    let end = start + rangeSize - 1;

    // Adjust if end exceeds the total pages
    if (end >= totalPages) {
        end = totalPages - 1;
        start = Math.max(0, end - rangeSize + 1);
    }

    // Generate the range array
    const paginationRange = [];
    for (let i = start; i <= end; i++) {
        paginationRange.push(i);
    }
    const showPaginationStats = false;
    if(paginationRange.length === 1 || (!usePagination && !showPaginationStats) ) return null;
    return (
        <div className={theme?.table?.paginationContainer}>
            {
                usePagination ? paginationRange.length === 1 ? null : (
                    <>
                        <div className={theme?.table?.paginationInfoContainer}>
                            <div className={theme?.table?.paginationPagesInfo}> Page {currentPage+1} of {totalPages} </div>
                            <div className={theme?.table?.paginationRowsInfo}> Rows {(currentPage * pageSize)+1} to {Math.min(+totalLength,(currentPage * pageSize) + pageSize)} of {totalLength}</div>
                        </div>
                        <div className={theme?.table?.paginationControlsContainer}>
                            {/*<div className={'cursor-pointer text-gray-500 hover:text-gray-800'}
                                 onClick={() => setCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>*/}

                            {
                                paginationRange.map(i => (
                                    <div key={i}
                                         className={`${theme?.table?.pageRangeItem}  ${currentPage === i ? theme?.table?.pageRangeItemActive : theme?.table?.pageRangeItemInactive} `}
                                         onClick={() => setCurrentPage(i)}
                                    >{i + 1}</div>
                                ))
                            }

                            <div className={`${theme?.table?.pageRangeItem} ${theme?.table?.pageRangeItemInactive}`}
                                 onClick={() => setCurrentPage(currentPage < totalPages - 1  ? currentPage + 1 : currentPage)}>{`next >`}</div>
                        </div>
                    </>
                ) : showPaginationStats ? (
                    <div className={'text-xs italic'}>
                        showing {totalLength} rows
                    </div>
                ) : null
            }
        </div>
    )
}