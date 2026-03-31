import React, {useContext, useEffect} from "react";
import {ComponentContext} from "../../../../../context";
import { ThemeContext  } from "../../../../../../../ui/useTheme";

export const Pagination = ({currentPage, setCurrentPage, showPagination, setReadyToLoad}) => {
    const { state, activeStyle } = useContext(ComponentContext);
    const {UI} = useContext(ThemeContext)
    const {Pagination} = UI;
    useEffect(() => {
        // Only auto-set readyToLoad for fresh components with no cached data.
        // Components with saved data already have readyToLoad set intentionally
        // via the "Always Fetch Data" toggle — don't override user intent.
        if(!state.display.usePagination && !state.display.readyToLoad
            && setReadyToLoad && !state.data?.length){
            setReadyToLoad(true);
        }
    }, [state.display.usePagination, state.display.readyToLoad, setReadyToLoad]);

    if(!state.columns?.filter(column => column.show).length || !showPagination) return;

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
