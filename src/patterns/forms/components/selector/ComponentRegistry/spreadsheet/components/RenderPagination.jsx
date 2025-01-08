import React from "react";

export const RenderPagination = ({usePagination, loadedRows, pageSize=10, currentPage, setCurrentPage, visibleAttributes}) => {
    if(!visibleAttributes.length) return;
    const rangeSize = 5;
    const totalPages=Math.ceil(loadedRows / pageSize);
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

    return (
        <div className={'float-right flex flex-col items-end p-1 text-xs text-gray-500'}>
            {
                usePagination ? (
                    <div className={'flex flex-row gap-1 items-center'}>
                        <div className={'cursor-pointer text-gray-500 hover:text-gray-800'}
                             onClick={() => setCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>

                            {
                                paginationRange.map(i => (
                                    <div key={i}
                                         className={`px-1 py-0.5 text-xs rounded-md border ${currentPage === i ? `border-blue-300 text-blue-500` : ``} hover:border-blue-300 cursor-pointer`}
                                         onClick={() => setCurrentPage(i)}
                                    >{i + 1}</div>
                                ))
                            }

                        <div className={'cursor-pointer text-gray-500 hover:text-gray-800'}
                             onClick={() => setCurrentPage(currentPage < totalPages ? currentPage + 1 : currentPage)}>{`next >>`}</div>
                    </div>
                ) : (
                    <div className={'text-xs italic'}>
                        showing {Math.min(loadedRows, totalPages)} of {isNaN(totalPages) ? 0 : parseInt(totalPages).toLocaleString()} rows
                    </div>
                )
            }
        </div>)
}