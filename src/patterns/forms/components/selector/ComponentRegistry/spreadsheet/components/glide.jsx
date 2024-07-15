import "@glideapps/glide-data-grid/dist/index.css";

import {
    DataEditor,
    // GridCell,
    GridCellKind,
    // GridColumn,
    // Item
} from "@glideapps/glide-data-grid";
import {allCells} from "@glideapps/glide-data-grid-cells";
import React, {useEffect, useMemo, useState} from "react";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";

const Glide = ({
                   attributes,
                   visibleAttributes, setVisibleAttributes,
                   data = [], setData,
                   updateItem,
                   colSizes, setColSizes,
                   isEdit,
                   newItem, setNewItem,
                   addItem,
                   orderBy, setOrderBy
               }) => {
    const [numRows, setNumRows] = useState(data.length);
    const [menu, setMenu] = React.useState();
    const hasResized = React.useRef(new Set());
    useEffect(() => setNumRows(data.length), [data.length]);

    const columns = useMemo(() => {
        return visibleAttributes.map((attr, i) => {
            const a = attributes.find(a => a.name === attr)

            return {
                ...a,
                title: a.display_name || a.name,
                id: a.name,
                sortable: true,
                width: colSizes[a.name],
                hasMenu: true,
                menuIcon: 'dots',
                grow: hasResized.current.has(attr.name) ? undefined : (5 + i) / 5
            }
        })
    }, [visibleAttributes, attributes, colSizes]);

    const getData = ([col, row]) => {
        const item = data[row] || {}
        const column = columns[col];
        const cellData = item[column.name] || '';
        return column.type === 'multiselect' ? {
            kind: GridCellKind.Custom,
            allowOverlay: true,
            copyData: cellData,
            readonly: false,
            data: {
                kind: "multi-select-cell",
                values: typeof cellData === "string" ? [cellData] : Array.isArray(cellData) ? cellData : undefined,
                options: column.options,
                allowDuplicates: false,
                allowCreation: true,
            },
        } : {
            kind: GridCellKind.Text,
            data: cellData,
            allowOverlay: true,
            readonly: false,
            displayData: cellData
        };
    }

    const onCellEdited = React.useCallback((cell, newValue) => {
        const [col, row] = cell;
        const key = columns[col].name;
        console.log('newval', data[row], data, row)
        if (!data[row]) data[row] = {};
        if (newValue.kind === 'custom' && newValue.data?.kind === 'multi-select-cell') {
            data[row][key] = newValue.data.values;
            updateItem(newValue.data.values, columns[col], data[row])
        }
        if (newValue.kind !== GridCellKind.Text) {
            // we only have text cells, might as well just die here.
            return;
        }
        data[row][key] = newValue.data;
        updateItem(newValue.data, columns[col], data[row])
    }, []);

    const onColumnResize = (column, size, colIndex) => {
        setColSizes({...colSizes, [column.name]: size})
        hasResized.current.add(column.name);
    };

    const onColumnMoved = (from, to) => {
        let tmpAttributes = [...visibleAttributes];
        [tmpAttributes[from], tmpAttributes[to]] = [tmpAttributes[to], tmpAttributes[from]]
        setVisibleAttributes(tmpAttributes)
    }

    // const onRowAppended = React.useCallback(async () => {
    //     // shift rows below index down
    //     for (let y = numRows; y > index; y--) {
    //         for (let x = 0; x < 6; x++) {
    //             setCellValueRaw([x, y], getCellContent([x, y - 1]));
    //         }
    //     }
    //     for (let c = 0; c < 6; c++) {
    //         const cell = getCellContent([c, index]);
    //         setCellValueRaw([c, index], clearCell(cell));
    //     }
    //
    //     setData([...data, {}])
    //     setNumRows(numRows+1)
    //
    //     setNumRows(cv => cv + 1);
    //     return index;
    // }, [getCellContent, numRows, setCellValueRaw, index]);

    // menu ===================================================
    const onHeaderMenuClick = (col, bounds) => {
        if (menu && columns[col]?.name === menu.col.name) {
            setMenu(undefined)
        } else {
            setMenu({
                col: columns[col],
                bounds
            });
        }
    };
    // end menu ===============================================
    const editOnlyControls = {
        onColumnResize,
        onColumnMoved
    }

    const RenderMenu = ({menu}) => {
        if (!menu) return null;
        const style = {
            willChange: "top, left, width, height",
            top: `${menu.bounds.y - 40}px`,
            left: `${menu.bounds.x}px`,
            width: `${menu.bounds.width}px`,
        };

        const actions = [
            {
                label: 'Sort A->Z',
                action: () => setOrderBy({[menu.col.name]: 'asc nulls last', id: 'asc'})
            },
            {
                label: 'Sort Z->A',
                action: () => setOrderBy({[menu.col.name]: 'desc nulls last', id: 'desc'})
            }
        ]

        return (<div className={'absolute bg-gray-100 divide-y p-2'} style={style}>
            {
                actions.map(action => (
                    <div
                        key={action.label}
                        className={'cursor-pointer'}
                        onClick={() => action.action()}>
                        {action.label}
                    </div>))
            }
        </div>)
    }

    return (
        <>
            <DataEditor className={'w-full'} columns={columns} getCellContent={getData} onCellEdited={onCellEdited}
                        customRenderers={allCells} enableFiltering={true} {...isEdit && editOnlyControls}
                // onRowAppended={onRowAppended}
                        trailingRowOptions={{
                            hint: "New row...",
                            sticky: true,
                            tint: true
                        }}
                        keybindings={{
                            downFill: true,
                            rightFill: true
                        }}
                        onHeaderMenuClick={onHeaderMenuClick}
                        // freezeColumns={1}
                        rows={numRows} onPaste={true} fillHandle={true} cellActivationBehavior="single-click"
            />
            <RenderMenu menu={menu}/>
        </>
    );
}

export default Glide