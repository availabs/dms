/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';

import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
// import { merge, cloneDeep } from 'lodash-es'

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



export default function Lexicals ({value, hideControls, showBorder, onChange, bgColor, editable=false, id, theme: themeProp, styleName, isCollab, collabId, collabUsername, collabCursorColor, fileUploadInfo }) {
  // Get theme from ThemeContext if not passed as prop
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const theme = themeProp || contextTheme;

  // Get the flat theme from DMS context (with textSettings heading overrides)
  // If styleName is provided, look up the style by name; otherwise use theme's activeStyle
  const flatLexicalTheme = theme ? getLexicalTheme(theme, styleName) : defaultLexicalTheme.styles[0];

  // Build the nested theme for LexicalComposer
  const nestedLexicalTheme = buildLexicalInternalTheme(flatLexicalTheme);
  // Pass Icons from the full DMS theme so IconNode.decorate() can access them
  if (theme?.Icons) {
    nestedLexicalTheme.Icons = theme.Icons;
  }
  // Pass the brand's textSettings tokens through so StyledParagraphNode can
  // resolve a styleKey (e.g. 'proseLG', 'metaSM upper') to its class string.
  // This is the backbone for the slash menu's named-style options — see
  // src/dms/skills/translating-design-system-to-dms-theme.md §3.1.4
  // (Approach B). Reads textSettings's currently active style.
  const tsStyles = theme?.textSettings?.styles;
  if (Array.isArray(tsStyles) && tsStyles.length) {
    const activeIdx = theme?.textSettings?.options?.activeStyle ?? 0;
    nestedLexicalTheme.brandTextStyles = { ...(tsStyles[0] || {}), ...(tsStyles[activeIdx] || {}) };
  }
  // Optional theme-driven filter: themes can declare which textSettings keys
  // should surface as `/Style: <key>` slash options. Without this filter,
  // every key (including the size-ladder textXS..text8XL) generates an
  // option — that's a lot for the menu. A brand with named tokens can
  // declare `textSettings.options.slashKeys: ['displayHero', ..., 'metaXS']`
  // to show ONLY those.
  const slashKeys = theme?.textSettings?.options?.slashKeys;
  if (Array.isArray(slashKeys)) {
    nestedLexicalTheme.brandTextStyleSlashKeys = slashKeys;
  }
  // Theme-driven column-layout templates for InsertLayoutDialog (`/columns`).
  // Without this, the dialog uses a hardcoded set of 6 generic Tailwind
  // grid-cols presets. Themes can declare their own brand-appropriate
  // templates — for tessera's 12-col grid we want splits like 1/3 + 2/3,
  // hero-CTA rows with content-width columns, etc. Falls back to the
  // hardcoded list when undefined.
  const layoutTemplates = (theme?.lexical as { layoutTemplates?: unknown })?.layoutTemplates;
  if (Array.isArray(layoutTemplates)) {
    nestedLexicalTheme.layoutTemplates = layoutTemplates;
  }

    const initialConfig = {
        // In collab mode, Yjs is the source of truth — editor starts empty,
        // content arrives via Yjs sync. The existing value is passed to
        // CollaborationPlugin's initialEditorState prop for first-time
        // bootstrap (seeds Yjs when the server doc is empty).
        editorState: isCollab ? null : (isLexicalJSON(value) ? value : null),
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

  // For collab first-time bootstrap: if Yjs doc is empty, seed it with existing content
  const collabInitialState = isCollab && isLexicalJSON(value) ? value : undefined;

  const inner = (
    <LexicalComposer key={isCollab ? `collab-${collabId}` : id} initialConfig={initialConfig}>
      <div className={`${nestedLexicalTheme.editorShell} ${showBorder ? 'border rounded-md' : ''}`}>
        {isCollab ? (
          <>
            <Editor
              theme={nestedLexicalTheme}
              editable={editable}
              hideControls={hideControls}
              bgColor={bgColor}
              isCollab={true}
              collabId={collabId}
              collabInitialState={collabInitialState}
              collabUsername={collabUsername}
              collabCursorColor={collabCursorColor}
              fileUploadInfo={ fileUploadInfo }
            />
            {onChange && <OnChangePlugin onChange={onChange} />}
          </>
        ) : (
          <UpdateEditor
            value={value}
            hideControls={hideControls}
            onChange={onChange}
            bgColor={bgColor}
            editable={editable}
            theme={nestedLexicalTheme}
            fileUploadInfo={ fileUploadInfo }
          />
        )}
      </div>
    </LexicalComposer>
  );

  return (
    <LexicalThemeContext.Provider value={theme}>
      {isCollab ? (
        <LexicalCollaboration>{inner}</LexicalCollaboration>
      ) : (
        inner
      )}
    </LexicalThemeContext.Provider>
  );
}

function UpdateEditor({ value, hideControls, onChange, bgColor, theme, editable, fileUploadInfo }) {
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
            <Editor theme={theme} editable={editable} hideControls={hideControls} bgColor={bgColor} fileUploadInfo={ fileUploadInfo }/>
            <OnChangePlugin onChange={onChange} />
        </>
    );
}
