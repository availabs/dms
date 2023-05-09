import React from "react"
import { getAttributes } from '../wrappers/_utils'
import isEqual from "lodash/isEqual"



function Edit({value, onChange, attributes={}}) {
    //const item
    const updateAttribute = (k, v) => {
        if(!isEqual(value, {...value, [k]: v})){
            onChange({...value, [k]: v})
        }
        //console.log('updateAttribute', value, k, v, {...value, [k]: v})
    }
    //console.log('dmsformat EDIT', attributes)
                    
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

const View = ({value={}, attributes}) => {
    return (
        <div>
            {Object.keys(attributes)
                .map((attrKey,i) => {
                    // console.log('dmsformat', attrKey, attributes)
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

export default {
    "EditComp": Edit,
    "ViewComp": View
}

