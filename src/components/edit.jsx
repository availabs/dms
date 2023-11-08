import React from 'react'
import {useTheme} from '../theme'
import get from 'lodash/get'

export default function EditCard({
                                     item={},
                                     attributes,
                                     updateAttribute,
                                     status,
                                     submit,
                                     next, nextDisabled,
                                     prev, prevDisabled,
                                     sectionId,
                                     ...props
                                 }) {
    const theme = useTheme()

    return (
        <div key={item.id} className={get(theme, 'card.wrapper', '')}>
            {status ? <div>{JSON.stringify(status)}</div> : ''}

            {Object.keys(attributes)
                .filter(attrKey => !sectionId || attributes[attrKey].section === sectionId)
                .map((attrKey, i) => {
                    let EditComp = attributes[attrKey].EditComp
                    return (
                        <div key={`${attrKey}-${i}`} className={get(theme, 'card.row', '')}>
                            <div className={get(theme, 'card.rowHeader', '')}>

                                <div className={get(theme, 'card.rowLabel', '')}>
                                    {attributes[attrKey]?.display_name || attributes[attrKey]?.label || attrKey}
                                </div>

                                {attributes[attrKey]?.prompt &&
                                    <i title={attributes[attrKey]?.prompt}
                                       className={get(theme, 'card.infoIcon', 'fad fa-info')}/>
                                }
                            </div>

                            <div className={get(theme, 'card.rowContent', '')}>
                                <EditComp
                                    key={`${attrKey}-${i}`}
                                    value={item?.[attrKey]}
                                    onChange={(v) => updateAttribute(attrKey, v)}
                                    {...attributes[attrKey]}
                                />
                            </div>
                        </div>
                    )
                })
            }

            <div className={theme?.card?.btnWrapper}>
                { prev && sectionId && <button className={theme?.card?.backBtn} disabled={prevDisabled} onClick={() => prev()}> Back </button> }
                { next && sectionId && <button className={theme?.card?.continueBtn} disabled={nextDisabled} onClick={() => next()}> Continue </button> }
                <button className={theme?.card?.submitBtn} onClick={() => submit()}> Save</button>
            </div>
</div>
)
}