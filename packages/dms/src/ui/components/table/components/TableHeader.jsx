import TableHeaderCell from "./TableHeaderCell";
import React, {memo, useMemo} from "react";

export const Header = memo(function Header ({
    tableTheme, visibleAttrsWithoutOpenOut,
    numColSize, frozenCols, frozenColClass, selectedCols,
    isEdit, columns, display, controls, setState, colResizer, start, end,
    localFilterData, activeStyle
}) {

    const attrsToRender = visibleAttrsWithoutOpenOut.slice(start, end + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender.map(c => `${c.size}px`).join(" ");
        return `${numColSize}px ${cols}`;
    }, [ start, end, attrsToRender, numColSize ]);

    return (
        <>
            {/****************************************** Header begin ********************************************/}
            <div
                className={tableTheme.headerContainer}
                style={{
                    zIndex: 5,
                    gridTemplateColumns: slicedGridTemplateColumns,
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
            >
                {/*********************** header left gutter *******************/}
                <div className={tableTheme.headerLeftGutter} style={{width: numColSize}}>
                    <div key={'#'} className={`w-full ${tableTheme.thContainerBg} ${frozenColClass}`} />
                </div>
                {/******************************************&*******************/}

                {attrsToRender
                    .map((attribute, i) => (
                            <div
                                key={i}
                                className={`${tableTheme.headerWrapper} ${frozenCols?.includes(i) ? tableTheme.headerWrapperFrozen : ''}`}
                                style={{width: attribute.size}}
                            >

                                <div key={`controls-${i}`}
                                     className={`
                                        ${tableTheme.headerCellContainer}
                                        ${selectedCols.includes(i) ? tableTheme.headerCellContainerBgSelected : tableTheme.headerCellContainerBg}`}
                                >
                                    <TableHeaderCell attribute={attribute}
                                                     isEdit={isEdit}
                                                     columns={columns}
                                                     display={display}
                                                     controls={controls}
                                                     setState={setState}
                                                     localFilterData={localFilterData}
                                                     activeStyle={activeStyle}
                                    />
                                </div>

                                <div
                                    key={`resizer-${i}`}
                                    className={colResizer ? tableTheme.colResizer : 'hidden'}
                                    style={{ height: '100%', cursor: 'col-resize', position: 'relative', right: 0, top: 0 }}
                                    onMouseDown={colResizer ? colResizer(attribute) : () => {}}
                                />
                            </div>
                        )
                    )}
            </div>
            {/****************************************** Header end **********************************************/}
        </>
    )
})
