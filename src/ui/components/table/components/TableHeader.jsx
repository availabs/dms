import TableHeaderCell from "./TableHeaderCell";
import React, {memo, useMemo} from "react";

export const Header = memo(function Header ({
                                                tableTheme, visibleAttrsWithoutOpenOut,
                                                numColSize, frozenCols, frozenColClass, selectedCols,
                                            isEdit, columns, display, controls, setState, colResizer, start, end, gutterColSize
                                            }) {

    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(start, end + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender
            .map(c => `${c.size}px`)
            .join(" ");

        return `${numColSize}px ${cols} ${gutterColSize}px`;
    }, [
        start,
        end,
        attrsToRender,
        numColSize,
        gutterColSize
    ]);

    return (
        <>
            {/****************************************** Header begin ********************************************/}
            <div
                className={`${tableTheme.headerContainer} top-0 sticky z-[100]`}
                style={{
                    zIndex: 5,
                    gridTemplateColumns: slicedGridTemplateColumns,
                    gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}`
                }}
            >
                {/*********************** header left gutter *******************/}
                <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                    <div key={'#'} className={`w-full ${tableTheme.thContainerBg} ${frozenColClass}`} />
                </div>
                {/******************************************&*******************/}

                {attrsToRender
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