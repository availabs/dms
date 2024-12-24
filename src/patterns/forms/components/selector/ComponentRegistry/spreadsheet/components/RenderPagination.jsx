import React from "react";

export const RenderPagination = ({usePagination, totalPages=0, loadedRows, pageSize=10, currentPage, setCurrentPage, visibleAttributes}) => {
    if(!visibleAttributes.length) return;
    const numNavBtns = Math.ceil(totalPages / pageSize);

    return (
        <div className={'float-right flex flex-col items-end p-1 text-sm font-gray-500'}>
            {
                usePagination ? (
                    <div className={'flex flex-row items-center'}>
                        <div className={'mx-1 cursor-pointer hover:text-gray-800'}
                             onClick={() => setCurrentPage(currentPage > 0 ? currentPage - 1 : currentPage)}>{`<< prev`}</div>
                        <select
                            className={'p-0.5 border-2 text-gray-800 hover:bg-blue-50 rounded-lg'}
                            value={currentPage}
                            onChange={e => setCurrentPage(+e.target.value)}
                        >
                            {
                                [...new Array(numNavBtns).keys()]
                                    .map((i) =>
                                        <option
                                            className={'p-2 border-2 text-gray-800 hover:bg-blue-50'}
                                            value={i} key={i}>{i + 1}
                                        </option>)
                            }
                        </select>
                        <div className={'mx-1 cursor-pointer text-gray-500 hover:text-gray-800'}
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