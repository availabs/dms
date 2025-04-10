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
import { merge,cloneDeep } from 'lodash-es'


import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
// import './lexical.css';



export default function Lexicals ({value, onChange, bgColor, editable=false, id, theme}) {
  
  const lexicalTheme = merge(cloneDeep(PlaygroundEditorTheme), cloneDeep(theme?.lexical || {}))
  // console.log('theme?', lexicalTheme)
  // console.log(PlaygroundEditorTheme, theme?.lexical, lexicalTheme)
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
    theme: lexicalTheme
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

function UpdateEditor ({value, onChange, bgColor, theme, editable}) {
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
          queueMicrotask(() => {
            editor.setEditorState(newEditorState)
          })
        }
      }
  }, [isFirstRender.current, value, theme])

  return (

    <>
      <Editor theme={theme} editable={editable} bgColor={bgColor}/>
      <OnChangePlugin onChange={onChange} />
    </>
  )
}



