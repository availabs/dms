import React, {useContext} from "react";
import {CMSContext, ComponentContext} from "../../../../context";

export const Pagination = ({currentPage, setCurrentPage, showPagination, setReadyToLoad}) => {
    const { state } = useContext(ComponentContext);
    const {UI} = useContext(CMSContext) || {UI: {Pagination: () => <></>}};
    const {Pagination} = UI;
    if(!state.columns.filter(column => column.show).length || !showPagination) return;

    if(!state.display.usePagination && !state.display.readyToLoad && setReadyToLoad){
        setReadyToLoad(true);
    }

    return <Pagination
        {...(state.display || {})}
        currentPage={currentPage}
        setCurrentPage={(i) => {
            setCurrentPage && setCurrentPage(i)
        }}
    />
}