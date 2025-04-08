import React, {useContext} from "react";
import { ComponentContext } from "../../dataWrapper";
import { tableTheme } from '../spreadsheet'
import { CMSContext } from '../../../../../siteConfig'

export const paginationTheme = {
    
}
export const Pagination = ({currentPage, setCurrentPage, showPagination, setReadyToLoad}) => {
    const {state} = useContext(ComponentContext)
    const { theme = { table: tableTheme } } = React.useContext(CMSContext) || {}
    if(!state.columns.filter(column => column.show).length || !showPagination) return;

    const rangeSize = 5;
    const totalPages=Math.ceil(state.display.totalLength / state.display.pageSize);
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

    if(paginationRange.length === 1 ) return null;
    if(!state.display.usePagination){
        setReadyToLoad && setReadyToLoad(true);
    }
    return (
        <div className={theme?.table?.paginationContainer}>
            {
                state.display.usePagination ? paginationRange.length === 1 ? null : (
                    <>
                        <div className={theme?.table?.paginationInfoContainer}>
                            <div className={theme?.table?.paginationPagesInfo}> Page {currentPage+1} of {totalPages} </div>
                            <div className={theme?.table?.paginationRowsInfo}> Rows {(currentPage * state.display.pageSize)+1} to {Math.min(+state.display.totalLength,(currentPage * state.display.pageSize)+state.display.pageSize)} of {state.display.totalLength}</div>
                        </div>
                        <div className={theme?.table?.paginationControlsContainer}>
                            {/*<div className={'cursor-pointer text-gray-500 hover:text-gray-800'}
                                 onClick={() => setCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>*/}

                                {
                                    paginationRange.map(i => (
                                        <div key={i}
                                             className={`${theme?.table?.pageRangeItem}  ${currentPage === i ? theme?.table?.pageRangeItemActive : theme?.table?.pageRangeItemInactive} `}
                                             onClick={() => {
                                                 setCurrentPage(i)
                                                 setReadyToLoad(true)
                                             }}
                                        >{i + 1}</div>
                                    ))
                                }

                            <div className={`${theme?.table?.pageRangeItem} ${theme?.table?.pageRangeItemInactive}`}
                                 onClick={() => setCurrentPage(currentPage < totalPages ? currentPage + 1 : currentPage)}>{`next >`}</div>
                        </div>
                    </>
                ) : (
                    <div className={'text-xs italic'}>
                        showing {state.display.totalLength} rows
                    </div>
                )
            }
        </div>)
}