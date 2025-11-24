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
import { merge,cloneDeep } from 'lodash-es'


import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
// import './lexical.css';

function isLexicalJSON(str) {
    try {
        const parsed = JSON.parse(str);
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}

export default function Lexicals ({value, onChange, bgColor, editable=false, id, theme}) {
  
  const lexicalTheme = merge(cloneDeep(PlaygroundEditorTheme), cloneDeep(theme?.lexical || {}), {tableScrollableWrapper: 'overflow-auto'})
  // console.log(PlaygroundEditorTheme, theme?.lexical, lexicalTheme)

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
        theme: lexicalTheme,
    };

  
  return (
    <LexicalComposer key={id} initialConfig={initialConfig}>
      <div className={`${lexicalTheme.editorShell}`}>
        <UpdateEditor
          value={value}
          onChange={onChange}
          bgColor={bgColor}
          editable={editable}
          theme={lexicalTheme}
        />
      </div>
    </LexicalComposer>
  );
}

function UpdateEditor({ value, onChange, bgColor, theme, editable }) {
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
            <Editor theme={theme} editable={editable} bgColor={bgColor} />
            <OnChangePlugin onChange={onChange} />
        </>
    );
}
