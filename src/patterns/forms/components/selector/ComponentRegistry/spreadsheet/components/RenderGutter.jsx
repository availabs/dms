import React from "react";
import {actionsColSize, numColSize, gutterColSize} from "../constants"

export const RenderGutter = ({allowEdit, c, visibleAttributes, isDragging, colSizes, attributes}) => (
    <div
        className={`bg-white grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]} divide-x divide-y ${isDragging ? `select-none` : ``} sticky bottom-0 z-[1]`}
        style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
    >
        <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
            <div key={'#'}
                 className={`w-full font-semibold border bg-gray-50 text-gray-500`}>
            </div>
        </div>
        {
            visibleAttributes.map(va => attributes.find(attr => attr.name === va))
                .filter(a => a)
                .map((attribute, attrI) => {
                    return (
                        <div
                            key={`gutter-${attrI}`}
                            className={`flex border bg-gray-50`}
                            style={{width: colSizes[attribute.name]}}
                        >
                            {` `}
                        </div>
                    )
                })
        }
        <div key={`gutter-actions-column`} className={'bg-white flex flex-row h-fit justify-evenly'}
             style={{width: actionsColSize}}>

        </div>
    </div>
)