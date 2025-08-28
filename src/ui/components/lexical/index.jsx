import React from "react"
import Editor from "./editor"

function isJsonString(str) {
    try { JSON.parse(str) }
    catch (e) { return false }
    return true;
}
// export default () => <div>afgfdsv</div>
function parseValue(value) {
    // --------------------------------
    // normalize incoming value for Lexical
    // --------------------------------
    if (!value) return null;

    if (typeof value === "object") {
        // already JS object → stringify
        return JSON.stringify(value);
    }

    if (typeof value === "string") {
        if (isJsonString(value)) {
            // lexical JSON string
            return value;
        } else {
            // plain text → pass through as text
            return value;
        }
    }

    return null;
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