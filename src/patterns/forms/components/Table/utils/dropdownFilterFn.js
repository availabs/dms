export function DropDownFilterFn(rows, id, filterValue) {
    return rows.filter(row => {
        const rowValue = row.values[id];
        return rowValue !== undefined && Array.isArray(filterValue) && filterValue.length
            ? filterValue.includes(rowValue)
            : rowValue !== undefined && filterValue.length ? rowValue === filterValue : true
    })
}