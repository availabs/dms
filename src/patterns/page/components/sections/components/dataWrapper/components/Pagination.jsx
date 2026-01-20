import React, {useContext, useEffect} from "react";
import {ComponentContext} from "../../../../../context";
import { ThemeContext  } from "../../../../../../../ui/useTheme";

export const Pagination = ({currentPage, setCurrentPage, showPagination, setReadyToLoad}) => {
    const { state, activeStyle } = useContext(ComponentContext);
    const {UI} = useContext(ThemeContext)
    const {Pagination} = UI;
    if(!state.columns.filter(column => column.show).length || !showPagination) return;

    useEffect(() => {
        if(!state.display.usePagination && !state.display.readyToLoad && setReadyToLoad){
            setReadyToLoad(true);
        }
    }, [state.display.usePagination, state.display.readyToLoad, setReadyToLoad]);

    return <Pagination
        totalLength={state.display.totalLength}
        filteredLength={state.display.filteredLength}
        pageSize={state.display.pageSize}
        usePagination={state.display.usePagination}
        currentPage={currentPage}
        setCurrentPage={(i) => {
            setCurrentPage && setCurrentPage(i)
        }}
        activeStyle={activeStyle}
    />
}
