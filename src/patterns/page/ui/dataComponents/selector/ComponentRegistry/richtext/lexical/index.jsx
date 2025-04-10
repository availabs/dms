import React from "react"
import Editor from "./editor/index"

function isJsonString(str) {
    try { JSON.parse(str) } 
    catch (e) { return false }
    return true;
}

function parseValue (value) {
    // --------------------------------
    // parse DMS value for lexical
    // lexical wants strigified JSON
    // --------------------------------
    return value && typeof value === 'object' ?
        JSON.stringify(value) : (isJsonString(value) ? value : null)
} 

const Edit = ({value, onChange, theme,  ...rest}) => {
    // console.log('lexical type edit')
    return (
        <Editor
            value={parseValue(value)}
            onChange={(d) => onChange(d)}
            editable={true}
            theme={theme}
            {...rest}
        />
    )
}


const View = ({value, theme,  ...rest}) => {
    // console.log('lexical type view', parseValue(value))
    return (
      <Editor 
        value={parseValue(value)}
        editable={false}
        theme={theme}
        {...rest}
          onChange={() => {}}
      />
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}