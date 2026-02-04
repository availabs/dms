import React, {useMemo} from "react"
import Editor from "./editor"
import { getHtml } from './ssr';
import { ThemeContext } from "../../themeContext";
import getLexicalTheme from "./useLexicalTheme";

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
  value, bgColor, id, theme, styleName
}) => {
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const resolvedTheme = theme || contextTheme;
  // Pass styleName to look up the correct style
  const LexicalTheme = getLexicalTheme(resolvedTheme, styleName);
  const [html, setHtml] = React.useState('')

  React.useEffect(() => {
    async function loadHtml() {
      setHtml(await getHtml(parseValue(value)));
    }
    loadHtml()
  }, [value]);

    return (
      <div className={`${LexicalTheme.editorShell}`}>
        <div dangerouslySetInnerHTML={{ __html: html }}></div>
      </div>
    );
});

export default {
    "EditComp": Edit,
    "ViewComp": View
}
