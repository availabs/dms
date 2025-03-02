
import {formatFunctions, getData} from "./spreadsheet/utils/utils";
import SpreadSheet, {SpreadSheetContext} from "./spreadsheet";
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
    subWrapperCompactView: 'flex flex-col border shadow rounded-[12px]',
    subWrapperSimpleView: 'grid',

    headerValueWrapper: 'w-full rounded-[12px] flex items-center justify-center p-2',
    headerValueWrapperCompactView: 'py-0',
    headerValueWrapperSimpleView: 'border shadow',
    justifyTextLeft: 'text-start',
    justifyTextRight: 'text-end',
    justifyTextCenter: 'text-center',

    textXS: 'text-xs',
    textSM: 'text-sm',
    textMD: 'text-md',
    textLG: 'text-lg',
    textXL: 'text-xl',
    text2XL: 'text-2xl',
    text3XL: 'text-3xl',
    text4XL: 'text-4xl',
    text5XL: 'text-5xl',
    text6XL: 'text-6xl',
    text7XL: 'text-7xl',
    text8XL: 'text-8xl',
    text9XL: 'text-9xl',

    fontThin: 'font-thin',
    fontExtraLight: 'font-extralight',
    fontLight: 'font-light',
    fontNormal: 'font-normal',
    fontMedium: 'font-medium',
    fontSemiBold: 'font-semibold',
    fontBold: 'font-bold',
    fontExtraBold: 'font-extrabold',
    fontBlack: 'font-black',

    header: 'w-full capitalize', // #37576B
    value: 'w-full' // #2D3E4C
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

export const Card = ({isEdit}) => {
    const { theme = {} } = React.useContext(CMSContext) || {};
    const dataCard = theme.dataCard || dataCardTheme;

    const {state:{columns, data, display: {compactView, gridSize, gridGap, padding, headerValueLayout, reverse, hideIfNull, bgColor='#FFFFFF'}}, setState} = useContext(SpreadSheetContext);
    const visibleColumns = useMemo(() => columns.filter(({show}) => show), [columns]);
    const cardsWithoutSpanLength = useMemo(() => columns.filter(({show, cardSpan}) => show && !cardSpan).length, [columns]);


    const mainWrapperStyle = gridSize && compactView ? {gridTemplateColumns: `repeat(${Math.min(gridSize, data.length)}, minmax(0, 1fr))`, gap: gridGap, backgroundColor: bgColor} : {gap: gridGap};
    const subWrapperStyle = compactView ? {} : {gridTemplateColumns: `repeat(${gridSize || cardsWithoutSpanLength}, minmax(0, 1fr))`, gap: gridGap || 2}

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
                        <div className={`${dataCard.subWrapper} ${compactView ? dataCard.subWrapperCompactView : dataCard.subWrapperSimpleView}`}
                             style={subWrapperStyle}>
                            {
                                visibleColumns
                                    .map(attr => {
                                        const value = attr.formatFn ?
                                            formatFunctions[attr.formatFn](item?.[attr.name], attr.isDollar) :
                                            item?.[attr.name]
                                        const id = item?.id;
                                        const {isLink, location, linkText, useId} = attr || {};
                                        const span = compactView ? 'span 1' : `span ${Math.min(attr.cardSpan || 1, cardsWithoutSpanLength)}`;

                                        const headerTextJustifyClass = justifyClass[attr.justify || 'center']?.header || justifyClass[attr.justify || 'center'];
                                        const valueTextJustifyClass = justifyClass[attr.justify || 'center']?.value || justifyClass[attr.justify || 'center'];
                                        return (
                                            <div key={attr.name}
                                                 className={`
                                                 ${dataCard.headerValueWrapper}
                                                 flex-${headerValueLayout} ${reverse && headerValueLayout === 'col' ? `flex-col-reverse` : reverse ? `flex-row-reverse` : ``}
                                                 ${compactView ? dataCard.headerValueWrapperCompactView : dataCard.headerValueWrapperSimpleView}`}
                                                 style={{gridColumn: span, padding, backgroundColor: compactView ? undefined : attr.bgColor}}
                                            >
                                                {
                                                    attr.hideHeader ? null : (
                                                        <div className={`
                                                        ${dataCard.header}
                                                         ${theme[headerTextJustifyClass]}
                                                          ${theme[attr.headerFontSize || 'textXS']}
                                                          ${theme[attr.headerFontWeight || 'fontLight']}
                                                          
                                                          `}>
                                                            {attr.customName || attr.display_name || attr.name}
                                                        </div>
                                                    )
                                                }
                                                <div className={`
                                                ${dataCard.value} 
                                                ${theme[valueTextJustifyClass]}
                                                 ${theme[attr.valueFontSize || 'textXS']}
                                                 ${theme[attr.valueFontWeight || 'fontLight']}
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
    "variables": [
        {name: 'visibleAttributes', hidden: true}, {name: 'attributes', hidden: true},
        {name: 'customColNames', hidden: true}, {name: 'orderBy', hidden: true},
        {name: 'colSizes', hidden: true}, {name: 'filters'},
        {name: 'groupBy', hidden: true}, {name: 'fn', hidden: true},
        {name: 'notNull', hidden: true}, {name: 'allowEditInView', hidden: true},
        {name: 'format', hidden: true}, {name: 'view', hidden: true},
        {name: 'actions', hidden: true}, {name: 'allowSearchParams', hidden: true},
        {name: 'loadMoreId', hidden: true}, {name: 'attributionData', hidden: true}
    ],
    getData,
    "EditComp": props => <SpreadSheet.EditComp {...props} compType={'card'}/>,
    "ViewComp": props => <SpreadSheet.ViewComp {...props} compType={'card'}/>,
}