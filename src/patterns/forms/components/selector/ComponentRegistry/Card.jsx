
import {formatFunctions, init} from "./spreadsheet/utils/utils";
import SpreadSheet from "./spreadsheet";
import RenderInHeaderColumnControls from "./spreadsheet/components/RenderInHeaderColumnControls";
import React, {useMemo} from "react";
import {Link} from "react-router-dom";

const justifyClass = {
    left: 'text-start',
    right: 'text-end',
    center: 'text-center'
}
const fontSizeClass = {
    small: {header: 'text-xs', value: 'text-sm'},
    medium: {header: 'text-sm', value: 'text-md'},
    large: {header: 'text-lg', value: 'text-xl'},
    xl: {header: 'text-xl', value: 'text-2xl'},
    '2xl': {header: 'text-2xl', value: 'text-3xl'},
}
const gridColsClass = {
    1: 'grid grid-cols-1',
    2: 'grid grid-cols-2',
    3: 'grid grid-cols-3',
    4: 'grid grid-cols-4',
    5: 'grid grid-cols-5',
    6: 'grid grid-cols-6',
    7: 'grid grid-cols-7',
    8: 'grid grid-cols-8',
    9: 'grid grid-cols-9',
    10: 'grid grid-cols-10',
    11: 'grid grid-cols-11',
};
const colSpanClass = {
    1: 'col-span-1',
    2: 'col-span-2',
    3: 'col-span-3',
    4: 'col-span-4',
    5: 'col-span-5',
    6: 'col-span-6',
    7: 'col-span-7',
    8: 'col-span-8',
    9: 'col-span-9',
    10: 'col-span-10',
    11: 'col-span-11',
}
export const Card = ({
    data, visibleAttributes, attributes, customColNames,
    // in header control props
     isEdit,
     colJustify, setColJustify,
     formatFn, setFormatFn,
     fontSize, setFontSize,
     linkCols, setLinkCols,
     hideHeader, setHideHeader,
     cardSpan, setCardSpan
}) => {
    const defaultColJustify = useMemo(() => visibleAttributes.reduce((acc, curr) => ({...acc, [curr]: colJustify[curr] || 'center'}), {}), [visibleAttributes, colJustify]);
    const cardsWithoutSpanLength = visibleAttributes.filter(v => !cardSpan[v]).length;
    return (
        <>
            {
                isEdit ? <div className={'flex gap-1'}>
                    {visibleAttributes
                        .map(va => attributes.find(attr => attr?.name === va))
                        .filter(a => a)
                        .map((attribute, i) =>
                            <div key={`controls-${i}`}
                                 className={`w-full font-semibold border bg-gray-50 text-gray-500`}>
                                <RenderInHeaderColumnControls
                                    isEdit={isEdit}
                                    attribute={attribute}
                                    // filters={filters} setFilters={setFilters}
                                    colJustify={defaultColJustify} setColJustify={setColJustify}
                                    formatFn={formatFn} setFormatFn={setFormatFn}
                                    fontSize={fontSize} setFontSize={setFontSize}
                                    linkCols={linkCols} setLinkCols={setLinkCols}
                                    hideHeader={hideHeader} setHideHeader={setHideHeader}
                                    cardSpan={cardSpan} setCardSpan={setCardSpan} maxCardSpan={cardsWithoutSpanLength}
                                    customColName={customColNames[attribute.name]}
                                />
                            </div>)}
                </div> : null
            }
            <div className={`w-full ${gridColsClass[cardsWithoutSpanLength]} gap-2`}>
                {
                    visibleAttributes
                        .map(attr => attributes.find(a => a.name === attr) || {name: attr})
                        .map(attr => {
                            const value = formatFn[attr.name] ?
                                formatFunctions[formatFn[attr.name]](data?.[0]?.[attr.name], attr.isDollar) :
                                data?.[0]?.[attr.name]
                            const {isLink, location, linkText} = linkCols[attr.name] || {};
                            return (
                                <div key={attr.name}
                                     className={`flex flex-col justify-center ${colSpanClass[Math.min(cardSpan[attr.name] || 1, cardsWithoutSpanLength)]} w-full p-2 rounded-md border shadow items-center`}>
                                    {
                                        hideHeader.includes(attr.name) ? null : (
                                            <div className={
                                                `w-full text-gray-500 capitalize 
                                             ${justifyClass[colJustify[attr.name] || 'center']}
                                             ${fontSizeClass[fontSize[attr.name]]?.header}`
                                            }>
                                                {customColNames[attr.name] || attr.display_name || attr.name}
                                            </div>
                                        )
                                    }
                                    <div className={
                                        `w-full text-gray-900 font-semibold 
                                    ${justifyClass[colJustify[attr.name] || 'center']}
                                    ${fontSizeClass[fontSize[attr.name]]?.value}`
                                    }>
                                        {
                                            isLink ? <Link to={`${location}${encodeURIComponent(value)}`}>{linkText || value}</Link> :
                                            value
                                        }
                                    </div>
                                </div>
                            )
                        })
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
    getData: init,
    "EditComp": props => <SpreadSheet.EditComp {...props} renderCard={true}/>,
    "ViewComp": props => <SpreadSheet.ViewComp {...props} renderCard={true}/>,
}