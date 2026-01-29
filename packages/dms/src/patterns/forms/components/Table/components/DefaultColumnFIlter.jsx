// import {useTheme} from "../../../wrappers";
import React from "react";

export const DefaultColumnFilter = ({column}) => {
    const {
        filterValue = "",
        // preFilteredRows,
        setFilter
    } = column;
    // count = preFilteredRows.length;
    const theme = {};
    return (
        <div className="w-3/4">
            <input className={theme.inputSmall}
                   value={filterValue} onChange={e => setFilter(e.target.value)}
                   onClick={e => e.stopPropagation()}
                   placeholder={`Search...`}/>
        </div>
    )
}
