import React, {useContext, useEffect} from "react";
import {CMSContext, ComponentContext} from "../../../../context";

export const Pagination = ({currentPage, setCurrentPage, showPagination, setReadyToLoad}) => {
    const { state } = useContext(ComponentContext);
    const {UI} = useContext(CMSContext) || {UI: {Pagination: () => <></>}};
    const {Pagination} = UI;
    if(!state.columns.filter(column => column.show).length || !showPagination) return;

    useEffect(() => {
        if(!state.display.usePagination && !state.display.readyToLoad && setReadyToLoad){
            setReadyToLoad(true);
        }
    }, [state.display.usePagination, state.display.readyToLoad, setReadyToLoad]);

    return <Pagination
        {...(state.display || {})}
        currentPage={currentPage}
        setCurrentPage={(i) => {
            setCurrentPage && setCurrentPage(i)
        }}
    />
}