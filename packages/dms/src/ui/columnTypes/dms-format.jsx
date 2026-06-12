import React from "react"
import { isEqual } from "lodash-es"



export function DmsFormatEdit({value, onChange, attributes={}}) {
    //const item
    const updateAttribute = (k, v) => {
        if(!isEqual(value, {...value, [k]: v})){
            onChange({...value, [k]: v})
        }
        
    }
    // if(!Object.keys(attributes).length) return <></>
                    
    return (
        <div>
            {/*<div>key: {attrKey}</div>*/}
            {Object.keys(attributes)
                .map((attrKey,i) => {
                    let EditComp = attributes[attrKey].EditComp
                    return(
                        <div key={`${attrKey}-${i}`} >  
                            <div>{attrKey}</div>
                            <div> 
                                <EditComp 
                                    key={`${attrKey}-${i}`} 
                                    value={value?.[attrKey]} 
                                    onChange={(v) => updateAttribute(attrKey, v)}
                                />
                            </div>
                        </div>
                    )
                })
            }
        </div>
    )   
}

export const DmsFormatView = ({value={}, attributes={}}) => {
    // if(!Object.keys(attributes).length) return <></>

    return (
        <div>
            {Object.keys(attributes)
                .map((attrKey,i) => {
                    let ViewComp = attributes[attrKey].ViewComp
                    return(
                        <div key={`${attrKey}-${i}`} >  
                            <div >{attrKey}</div>
                            <div > 
                                <ViewComp key={`${attrKey}-${i}`} value={value[attrKey]} />
                            </div>
                        </div>
                    )
                })
            }
        </div>
    )
}


