import React from "react";

export const RenderExpandedRow = ({row, expand, visibleColumns, ExpandRow, theme}) => {
    if(!row.isExpanded || !expand.length) return null;

    return (
        <tr className={theme.tableRow}>
            <td colSpan={visibleColumns.length} className={theme.tableCell}>
                <ExpandRow values={expand}/>
            </td>
        </tr>
    )
}