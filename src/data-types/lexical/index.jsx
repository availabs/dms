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

const Edit = ({value, onChange}) => {
    return (
        <div className="editor-shell">
          <Editor 
            value={parseValue(value)}
            onChange={(d) => { onChange(d) }}
            editable={true}
          />
        </div>
    )
}

const View = ({value}) => {
    return (
        <div className="editor-shell">
          <Editor 
            value={parseValue(value)}
            editable={false}
          />
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}