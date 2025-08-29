import React from "react"
import Editor from "./editor"

function parseValue(value) {
    if (typeof value === 'undefined' || value === null) return null;

    if (typeof value === "object") {
        // ensure it’s a proper string for Lexical
        return JSON.stringify(value);
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed?.root) {
                return value; // valid Lexical JSON string
            } else {
                return value; // plain text
            }
        } catch {
            return value; // plain text
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