import { get } from "lodash-es";
import React from "react";

export const RenderCell = ({
   ii, cell, row, columns,
   expand, expanded, toggleRowExpanded,
   theme
}) => {
    return (
        <td 
            key={ii} 
            {
                ...cell.getCellProps({
                style: {
                    minWidth: cell.column.minWidth,
                    maxWidth: cell.column.maxWidth,
                    width: cell.column.width,
                },
                })
            } 
            className={`text-${get(columns.find(c => c.Header === cell.column.Header), 'align') || 'center'} ${theme.tableCell}`}
        >
            {(ii > 0) || ((row.subRows.length === 0) && (expand.length === 0)) ?
                cell.render('Cell') :
                (
                    <div className={`flex items-center `}>
                        <div onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            Object.keys(expanded).filter(k => k !== row.id)
                                .forEach(toggleRowExpanded);
                            row.toggleRowExpanded(!row.isExpanded);
                        }} className={`
                          flex item-center justify-center
                          rounded cursor-pointer py-1 px-2
                        h-full hover:text-blue-500
                           ${theme.transition}
                        `}>
                            {row.isExpanded ?
                                <i className="fal fa-chevron-down"/> :
                                <i className="fal fa-chevron-right"/>
                            }
                        </div>
                        <div className="flex-1">{cell.render('Cell')}</div>
                        
                    </div>
                )
            }
        </td>
    )
}