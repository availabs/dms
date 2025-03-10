
import {formatFunctions, getData} from "./shared/dataWrapper/utils";
import SpreadSheet, {ComponentContext} from "./shared/dataWrapper";
import TableHeaderCell from "./spreadsheet/components/TableHeaderCell";
import React, {useContext, useEffect, useMemo} from "react";
import {Link} from "react-router-dom";
import {CMSContext} from "../../../../siteConfig";

const justifyClass = {
    left: 'justifyTextLeft',
    right: 'justifyTextRight',
    center: 'justifyTextCenter',
    full: {header: 'justifyTextLeft', value: 'justifyTextRight'}
}

export const dataCardTheme = {
    columnControlWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlHeaderWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,

    mainWrapperCompactView: 'grid',
    mainWrapperSimpleView: 'flex flex-col',

    subWrapper: 'w-full',
    subWrapperCompactView: 'flex flex-col rounded-[12px]',
    subWrapperSimpleView: 'grid',

    headerValueWrapper: 'w-full rounded-[12px] flex items-center justify-center p-2',
    headerValueWrapperCompactView: 'py-0',
    headerValueWrapperSimpleView: '',
    justifyTextLeft: 'text-start',
    justifyTextRight: 'text-end',
    justifyTextCenter: 'text-center',

    textXS: 'text-xs font-medium',
    textXSReg: 'text-xs font-normal',
    textSM: 'text-sm font-medium',
    textSMReg: 'text-sm font-normal',
    textSMBold: 'text-sm font-normal',
    textSMSemiBold: 'text-sm font-semibold',
    textMD: 'ftext-md ont-medium',
    textMDReg: 'text-md font-normal',
    textMDBold: 'text-md font-bold',
    textMDSemiBold: 'text-md font-semibold',
    textXL: 'text-xl font-medium',
    textXLSemiBold: 'text-xl font-semibold',
    text2XL: 'text-2xl font-medium',
    text2XLReg: 'text-2xl font-regular',
    text3XL: 'text-3xl font-medium',
    text3XLReg: 'text-3xl font-normal',
    text4XL: 'text-4xl font-medium',
    text5XL: 'text-5xl font-medium',
    text6XL: 'text-6xl font-medium',
    text7XL: 'text-7xl font-medium',
    text8XL: 'text-8xl font-medium',

    header: 'w-full capitalize',
    value: 'w-full'
}
// cards can be:
// one cell per row, that carries one column's data,
// one cell per row, that can carry multiple column's data

// compact view:
// bg color per card (which is a row)

// simple view: one cell per column - value pair
// span
// inline vs stacked; reverse
// bg color per column

const Card = ({isEdit}) => {
    const { theme = {} } = React.useContext(CMSContext) || {};
    const dataCard = theme.dataCard || dataCardTheme;

    const {state:{columns, data, display: {compactView, gridSize, gridGap, padding, headerValueLayout, reverse, hideIfNull, removeBorder, bgColor='#FFFFFF'}}, setState} = useContext(ComponentContext);
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => columns.filter(({show, cardSpan}) => show && !cardSpan).length, [columns]);


    const mainWrapperStyle = gridSize && compactView ? {gridTemplateColumns: `repeat(${Math.min(gridSize, data.length)}, minmax(0, 1fr))`, gap: gridGap} : {gap: gridGap};
    const subWrapperStyle = compactView ? {backgroundColor: bgColor, padding} : {gridTemplateColumns: `repeat(${gridSize || cardsWithoutSpanLength}, minmax(0, 1fr))`, gap: gridGap || 2}

    useEffect(() => {
        // set hideSection flag
        if(!isEdit) return;

        if(!hideIfNull){
            setState(draft => {
                draft.hideSection = false;
            })
        }else{
            const hide = data.length === 0 ||
                         data.every(row => columns.filter(({ show }) => show)
                                                    .every(col => {
                                                        const value = row[col.name];
                                                        return value === null || value === undefined || value === "";
                                                    }));
            setState(draft => {
                draft.hideSection = hide;
            })
        }
    }, [data, hideIfNull])
    return (
        <>
            {
                isEdit ? <div className={dataCard.columnControlWrapper}>
                    {visibleColumns.map((attribute, i) =>
                            <div key={`controls-${i}`} className={dataCard.columnControlHeaderWrapper}>
                                <TableHeaderCell
                                    isEdit={isEdit}
                                    attribute={attribute}
                                />
                            </div>)}
                </div> : null
            }

            {/* outer wrapper: in compact view, grid applies here */}
            <div className={gridSize && compactView ? dataCard.mainWrapperCompactView : dataCard.mainWrapperSimpleView} style={mainWrapperStyle}>
                {
                    data.map(item => (
                        //  in normal view, grid applied here
                        <div className={`${dataCard.subWrapper} ${compactView ? `${dataCard.subWrapperCompactView} ${removeBorder ? `` : 'border shadow'}` : dataCard.subWrapperSimpleView} `}
                             style={subWrapperStyle}>
                            {
                                visibleColumns
                                    .map(attr => {
                                        const value = attr.formatFn ?
                                            formatFunctions[attr.formatFn](item?.[attr.name], attr.isDollar).replaceAll(' ', '') :
                                            item?.[attr.name]
                                        const id = item?.id;
                                        const {isLink, location, linkText, useId} = attr || {};
                                        const span = compactView ? 'span 1' : `span ${attr.cardSpan || 1}`;

                                        const headerTextJustifyClass = justifyClass[attr.justify || 'center']?.header || justifyClass[attr.justify || 'center'];
                                        const valueTextJustifyClass = justifyClass[attr.justify || 'center']?.value || justifyClass[attr.justify || 'center'];
                                        return (
                                            <div key={attr.name}
                                                 className={`
                                                 ${dataCard.headerValueWrapper}
                                                 flex-${headerValueLayout} ${reverse && headerValueLayout === 'col' ? `flex-col-reverse` : reverse ? `flex-row-reverse` : ``}
                                                 ${compactView ? dataCard.headerValueWrapperCompactView : `${dataCard.headerValueWrapperSimpleView} ${removeBorder ? `` : 'border shadow'}`}`}
                                                 style={{gridColumn: span, padding: compactView ? undefined : padding, backgroundColor: compactView ? undefined : attr.bgColor}}
                                            >
                                                {
                                                    attr.hideHeader ? null : (
                                                        <div className={`
                                                        ${dataCard.header} ${compactView ? dataCard.headerCompactView : dataCard.headerSimpleView}
                                                         ${dataCard[headerTextJustifyClass]}
                                                          ${dataCard[attr.headerFontStyle || 'textXS']}
                                                          
                                                          `}>
                                                            {attr.customName || attr.display_name || attr.name}
                                                        </div>
                                                    )
                                                }
                                                <div className={`
                                                ${dataCard.value} ${compactView ? dataCard.valueCompactView : dataCard.valueSimpleView}
                                                ${dataCard[valueTextJustifyClass]}
                                                 ${dataCard[attr.valueFontStyle || 'textXS']}
                                                 `}>
                                                    {
                                                        isLink ?
                                                            <Link to={`${location}${encodeURIComponent(useId ? id : value)}`}>
                                                                {linkText || value}
                                                            </Link> :
                                                            value
                                                    }
                                                </div>
                                            </div>
                                        )
                                    })
                            }
                        </div>
                    ))
                }
            </div>
        </>
    )
}

export default {
    "name": 'Card',
    "type": 'card',
    getData,
    useDataSource: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: false,
    showPagination: true,
    controls: [],
    "EditComp": Card,
    "ViewComp": Card,
}