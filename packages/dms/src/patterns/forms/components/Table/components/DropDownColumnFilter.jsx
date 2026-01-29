import React from "react";
// import {Select} from "../../Inputs";

export const DropDownColumnFilter = ({
                                  column: {
                                      filterValue,
                                      setFilter,
                                      preFilteredRows,
                                      id,
                                      filterMeta,
                                      filterDomain,
                                      onFilterChange,
                                      customValue,
                                      filterThemeOptions,
                                      filterClassName,
                                      filterMulti,
                                      filterRemovable = true
                                  },
                              }) => {
    // Calculate the options for filtering
    // using the preFilteredRows
    const options = React.useMemo(() => {
        const options = new Set()
        if (filterMeta) {
            return filterMeta
        }
        preFilteredRows.forEach(row => {
            options.add(row.values[id])
        })
        return [...options.values()]
    }, [filterMeta, id, preFilteredRows])
        .filter(d => d)

    const count = preFilteredRows.length;
    // Render a multi-select box
    return (
        <div className="">
            <select
                domain={filterDomain || options}
                value={filterValue || customValue || []}
                // value = {['row2']}
                onChange={(e) => {
                    setFilter(e || undefined)
                    onFilterChange(e || undefined) // Set undefined to remove the filter entirely
                }}
                placeHolder={`Search ${count} records...`}
                removable={filterRemovable}
                multi={filterMulti}
                themeOptions={filterThemeOptions}
                className={`${filterClassName}`}
            />
        </div>
    )
}