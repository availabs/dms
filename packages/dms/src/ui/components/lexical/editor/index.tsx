/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import React from 'react';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { merge, cloneDeep } from 'lodash-es'

import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { getLexicalTheme, LexicalThemeContext } from '../useLexicalTheme';
import { lexicalTheme as defaultLexicalTheme, buildLexicalInternalTheme } from '../theme';
// Import ThemeContext from separate file to avoid circular dependency with defaultTheme
import { ThemeContext } from '../../../themeContext';

function isLexicalJSON(str) {
    try {
        const parsed = JSON.parse(str);
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}

export default function Lexicals ({value, hideControls, showBorder, onChange, bgColor, editable=false, id, theme: themeProp}) {
  // Get theme from ThemeContext if not passed as prop
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const theme = themeProp || contextTheme;

  // Get the flat theme from DMS context (with textSettings heading overrides)
  const flatLexicalTheme = theme ? getLexicalTheme(theme) : defaultLexicalTheme.styles[0];

  // Build the nested theme for LexicalComposer
  const nestedLexicalTheme = buildLexicalInternalTheme(flatLexicalTheme);

    const initialConfig = {
        editorState: isLexicalJSON(value) ? value : null,
        namespace: 'dms-lexical',
        nodes: [...PlaygroundNodes],
        editable: editable,
        readOnly: !editable,
        onError: (error) => {
            // throw error;
            console.error('Error in Rich text:', error)
        },
        theme: nestedLexicalTheme,
    };

  return (
    <LexicalThemeContext.Provider value={theme}>
      <LexicalComposer key={id} initialConfig={initialConfig}>
        <div className={`${nestedLexicalTheme.editorShell} ${showBorder ? 'border rounded-md' : ''}`}>
          <UpdateEditor
            value={value}
            hideControls={hideControls}
            onChange={onChange}
            bgColor={bgColor}
            editable={editable}
            theme={nestedLexicalTheme}
          />
        </div>
      </LexicalComposer>
    </LexicalThemeContext.Provider>
  );
}

function UpdateEditor({ value, hideControls, onChange, bgColor, theme, editable }) {
    const isFirstRender = React.useRef(true);
    const lastValue = React.useRef();
    const [editor] = useLexicalComposerContext();

    React.useEffect(() => {
        if(editable){
            // avoid re-rendering on value change while editing
            if (!isFirstRender.current) return;
            isFirstRender.current = false;
        }else{
            // need to re-render if value changes
            if (lastValue.current === value) return;
            lastValue.current = value;
        }

        if (!value) {
            // fallback: empty paragraph
            editor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                paragraph.append($createTextNode(""));
                root.append(paragraph);
            });
            return;
        }

        if (isLexicalJSON(value)) {
            const newEditorState = editor.parseEditorState(value);
            // lexical calls flushSync that results in a warning. queueMicrotask is a fix for that.
            queueMicrotask(() => {
                editor.setEditorState(newEditorState);
            });
        } else {
            // plain text
            editor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                paragraph.append($createTextNode(value));
                root.append(paragraph);
            });
        }
    }, [editor, value]);

    return (
        <>
            <Editor theme={theme} editable={editable} hideControls={hideControls} bgColor={bgColor} />
            <OnChangePlugin onChange={onChange} />
        </>
    );
}
