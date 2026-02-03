import React, {useMemo} from "react"
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

const Edit = ({value, onChange,  ...rest}) => {
    // console.log('lexical type edit')
    return (
        <Editor
            value={parseValue(value)}
            onChange={(d) => onChange(d)}
            editable={true}
            {...rest}
        />
    )
}

const noop = () => {};

const View = React.memo(({
                             value, bgColor, id, theme
                              }) => {
    const parsedValue = useMemo(
        () => parseValue(value),
        [value]
    );

    return (
        <Editor
            value={parsedValue}
            editable={false}
            onChange={noop}
            bgColor={bgColor}
            id={id}
        />
    );
});

export default {
    "EditComp": Edit,
    "ViewComp": View
}
