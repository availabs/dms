import TableHeaderCell from "./TableHeaderCell";
import React, {memo} from "react";

export const Header = memo(function Header ({
                                                tableTheme, gridTemplateColumns, visibleAttrsWithoutOpenOut, visibleAttrsWithoutOpenOutLength,
                                                numColSize, frozenCols, frozenColClass, selectedCols,
                                            isEdit, columns, display, controls, setState, colResizer
                                            }) {
    return (
        <>
            {/****************************************** Header begin ********************************************/}
            <div
                className={`${tableTheme.headerContainer} top-0 sticky z-[100]`}
                style={{
                    zIndex: 5,
                    gridTemplateColumns: gridTemplateColumns,
                    gridColumn: `span ${visibleAttrsWithoutOpenOutLength + 2} / ${visibleAttrsWithoutOpenOutLength + 2}`
                }}
            >
                {/*********************** header left gutter *******************/}
                <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                    <div key={'#'} className={`w-full ${tableTheme.thContainerBg} ${frozenColClass}`} />
                </div>
                {/******************************************&*******************/}

                {visibleAttrsWithoutOpenOut
                    .map((attribute, i) => (
                            <div
                                key={i}
                                className={`${tableTheme.thead} ${frozenCols?.includes(i) ? tableTheme.theadfrozen : ''}`}
                                style={{width: attribute.size}}
                            >

                                <div key={`controls-${i}`}
                                     className={`
                                        ${tableTheme.thContainer}
                                        ${selectedCols.includes(i) ? tableTheme.thContainerBgSelected : tableTheme.thContainerBg}`}
                                >
                                    <TableHeaderCell attribute={attribute} isEdit={isEdit} columns={columns} display={display} controls={controls} setState={setState} />
                                </div>

                                <div
                                    key={`resizer-${i}`}
                                    className={colResizer ? "z-5 -ml-2 w-[1px] hover:w-[2px] bg-gray-200 hover:bg-gray-400" : 'hidden'}
                                    style={{
                                        height: '100%',
                                        cursor: 'col-resize',
                                        position: 'relative',
                                        right: 0,
                                        top: 0
                                    }}
                                    onMouseDown={colResizer ? colResizer(attribute) : () => {}}
                                />

                            </div>
                        )
                    )}

                {/***********gutter column cell*/}
                <div key={'##'}
                     className={`${tableTheme.thContainerBg} z-[1] flex shrink-0 justify-between`}
                > {` `}</div>
            </div>
            {/****************************************** Header end **********************************************/}
        </>
    )
})