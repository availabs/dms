import React from "react";

export const RenderPagination = ({totalPages, pageSize, currentPage, setVCurrentPage}) => {
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