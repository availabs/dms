import React from "react"
import Editor from "./editor"
import { getHtmlSync, attachCollapsibleHandlers } from './ssr';
import { ThemeContext } from "../../themeContext";
import getLexicalTheme from "./useLexicalTheme";

function isLexicalJSON(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}

function textToLexicalJSON(text) {
    return JSON.stringify({
        root: {
            children: [{
                children: [{
                    detail: 0, format: 0, mode: "normal", style: "",
                    text: text || '', type: "text", version: 1
                }],
                direction: "ltr", format: "", indent: 0,
                type: "paragraph", version: 1,
            }],
            direction: "ltr", format: "", indent: 0,
            type: "root", version: 1,
        }
    });
}

function parseValue(value) {
    if (typeof value === 'undefined' || value === null) return null;
    if (typeof value === "object") {
        if (value?.root) return JSON.stringify(value);
        return null;
    }
    if (typeof value === "string") {
        if (!value.trim()) return null;
        if (isLexicalJSON(value)) return value;
        return textToLexicalJSON(value);
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

// const View = React.memo(({value, onChange,  ...rest}) => {
//     // console.log('lexical type edit')
//     return (
//         <Editor
//             value={parseValue(value)}
//             onChange={(d) => {}}
//             editable={false}
//             {...rest}
//         />
//     )
// })

const View = React.memo(({
  value, bgColor, id, theme, styleName
}) => {
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const resolvedTheme = theme || contextTheme;
  const LexicalTheme = getLexicalTheme(resolvedTheme, styleName);
  const containerRef = React.useRef(null);

  const html = React.useMemo(
    () => getHtmlSync(parseValue(value), LexicalTheme, resolvedTheme?.Icons),
    [value, LexicalTheme]
  );

  React.useEffect(() => {
    if (!containerRef.current || !html) return;
    return attachCollapsibleHandlers(containerRef.current);
  }, [html]);

  return (
    <div className={`${LexicalTheme.editorShell}`} ref={containerRef}>
      <div className={LexicalTheme.editorViewContainer || ''} style={bgColor ? { backgroundColor: bgColor } : undefined}>
        <div className={LexicalTheme.viewScroller || ''}>
          <div className={`${LexicalTheme.contentEditable || ''} w-full`}>
            <div dangerouslySetInnerHTML={{ __html: html }}></div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default {
    "EditComp": Edit,
    "ViewComp": View
}
