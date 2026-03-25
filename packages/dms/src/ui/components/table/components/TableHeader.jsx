import TableHeaderCell from "./TableHeaderCell";
import React, {memo, useMemo, useState} from "react";
import CardColumnPicker from '../../CardColumnPicker';

export const Header = memo(function Header ({
    tableTheme, visibleAttrsWithoutOpenOut,
    numColSize, frozenCols, frozenColClass, selectedCols,
    isEdit, columns, display, controls, setState, colResizer, start, end,
    localFilterData, activeStyle
}) {

    const attrsToRender = visibleAttrsWithoutOpenOut.slice(start, end + 1);
    const [headerHovered, setHeaderHovered] = useState(false);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender.map(c => `${c.size}px`).join(" ");
        return `${numColSize}px ${cols}`;
    }, [ start, end, attrsToRender, numColSize ]);

    const showPicker = isEdit && setState && controls?.inHeader;

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
                onMouseEnter={() => setHeaderHovered(true)}
                onMouseLeave={() => setHeaderHovered(false)}
            >
                {/*********************** header left gutter *******************/}
                <div className={tableTheme.headerLeftGutter} style={{width: numColSize}}>
                    <div key={'#'} className={`w-full ${tableTheme.thContainerBg} ${frozenColClass}`} />
                </div>
                {/******************************************&*******************/}

                {attrsToRender
                    .map((attribute, i) => {
                        const isLast = i === attrsToRender.length - 1;
                        const fullIdx = columns.findIndex(c => c.name === attribute.name && c.isDuplicate === attribute.isDuplicate && c.copyNum === attribute.copyNum);

                        return (
                            <div
                                key={i}
                                className={`relative ${tableTheme.headerWrapper} ${frozenCols?.includes(i) ? tableTheme.headerWrapperFrozen : ''}`}
                                style={{width: attribute.size}}
                            >
                                <div key={`controls-${i}`}
                                     className={`
                                        ${tableTheme.headerCellContainer}
                                        ${selectedCols.includes(i) ? tableTheme.headerCellContainerBgSelected : tableTheme.headerCellContainerBg}`}
                                >
                                    {
                                        attribute._isActionsColumn ? null :
                                        <TableHeaderCell attribute={attribute}
                                                      isEdit={isEdit}
                                                      columns={columns}
                                                      display={display}
                                                      controls={controls}
                                                      setState={setState}
                                                      localFilterData={localFilterData}
                                                      activeStyle={activeStyle}
                                        />
                                    }
                                </div>

                                <div
                                    key={`resizer-${i}`}
                                    className={colResizer ? tableTheme.colResizer : 'hidden'}
                                    style={{ height: '100%', cursor: 'col-resize', position: 'relative', right: 0, top: 0 }}
                                    onMouseDown={colResizer ? colResizer(attribute) : () => {}}
                                />

                                {showPicker && isLast && (
                                    <CardColumnPicker
                                        insertAt={fullIdx !== -1 ? fullIdx + 1 : columns.length}
                                        columns={columns}
                                        sourceColumns={controls.sourceColumns}
                                        setState={setState}
                                        FormulaColumnModal={controls.FormulaColumnModal}
                                        CalculatedColumnModal={controls.CalculatedColumnModal}
                                        parentHovered={headerHovered}
                                        triggerClassName="absolute top-0 bottom-0 right-0 translate-x-full flex items-center z-10 w-5"
                                    />
                                )}
                            </div>
                        );
                    })}
            </div>
            {/****************************************** Header end **********************************************/}
        </>
    )
})
