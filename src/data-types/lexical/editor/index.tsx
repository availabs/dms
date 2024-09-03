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


import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import './lexical.css';



export default function Lexicals ({value, onChange, bgColor, editable=false, id}) {
  
  const initialConfig = {
    editorState:
        JSON.parse(value || '{}')?.root &&
        JSON.parse(value || '{}')?.root?.children?.length
            ? value : null,
    namespace: 'dms-lexical',
    nodes: [...PlaygroundNodes],
    editable: editable,
    readOnly: !editable,
    onError: (error) => {
      throw error;
    },
    theme: PlaygroundEditorTheme
  };

  
  return (
    <LexicalComposer key={id} initialConfig={initialConfig}>
      <UpdateEditor 
        value={value}
        onChange={onChange}
        bgColor={bgColor}
        editable={editable}
      />
    </LexicalComposer>
  );
}

function UpdateEditor ({value, onChange, bgColor, editable}) {
  const isFirstRender = React.useRef(true);
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
      if (isFirstRender.current) {
          isFirstRender.current = false;
      }
      if(!editable && !isFirstRender.current){
        const parsedValue = JSON.parse(value || '{}')
        const update = parsedValue.root && parsedValue?.root?.children?.length
          ? value : null
        if(update) {
          const newEditorState = editor.parseEditorState(update)
          editor.setEditorState(newEditorState)
        }
      }
  }, [isFirstRender.current,value])

  return (
    <div className="editor-shell">
      <Editor editable={editable} bgColor={bgColor}/>
      <OnChangePlugin onChange={onChange} />
    </div>
  )
}



