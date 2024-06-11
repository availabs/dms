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


import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import './lexical.css';



export default function Lexicals ({value, onChange, bgColor, editable=false, id}) {
  
  //console.log('lexical', value)
  const initialConfig = {
    editorState:
        JSON.parse(value || '{}')?.root &&
        JSON.parse(value || '{}')?.root?.children?.length
            ? value : null,
    namespace: 'dms-lexical',
    nodes: [...PlaygroundNodes],
    editable: editable,
    readOnly: editable,
    onError: (error) => {
      throw error;
    },
    theme: PlaygroundEditorTheme
  };

  //console.log('initialConfig', initialConfig)

  return (
    <LexicalComposer key={id} initialConfig={initialConfig}>
      <div className="editor-shell">
        <Editor editable={editable} bgColor={bgColor}/>
        <OnChangePlugin onChange={onChange} />
      </div>
    </LexicalComposer>
  );
}

