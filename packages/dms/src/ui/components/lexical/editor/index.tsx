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
import { createPortal, flushSync } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
// import { merge, cloneDeep } from 'lodash-es'

import Editor from './editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { getLexicalTheme, LexicalThemeContext } from '../useLexicalTheme';
import { lexicalTheme as defaultLexicalTheme, buildLexicalInternalTheme } from '../theme';
// Import ThemeContext from separate file to avoid circular dependency with defaultTheme
import { ThemeContext } from '../../../themeContext';
import { PageActionsContext } from './context/PageActionsContext';
import { getHtmlSync } from '../ssr';

function isLexicalJSON(str) {
    try {
        const parsed = JSON.parse(str);
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}


// Editors whose content is set in the same turn of the event loop are attached in one React commit.
// One at a time, each attach would dirty the page's layout under the next editor still mounting.
// The flush is a microtask and commits synchronously, so it lands before the browser paints: a
// section that remounts on the client has no server HTML to show in the meantime, and a timer here
// let a blank frame through each time.
let showQueue = [];
let showQueued = false;
function showTogether(show) {
    showQueue.push(show);
    if (showQueued) return;
    showQueued = true;
    queueMicrotask(() => {
        const queue = showQueue;
        showQueue = []; showQueued = false;
        flushSync(() => queue.forEach((fn) => fn()));
    });
}

// `plugins`: extra Lexical plugins (React elements) a caller renders inside this editor's
// LexicalComposer, so they can use `useLexicalComposerContext`. The library knows nothing about
// them; the chat pattern's @-mention typeahead is the first caller.
// `placeholder` / `ariaLabel` / `placeholderClassName`: the empty editor's hint, the editable
// region's accessible name, and where the hint sits (the default is placed for a page section's
// gutter). Editor took the first two all along; this wrapper dropped them until 2026-11-17.
// `componentPicker`: { hide, include: [option titles], placement: 'above' } for the `/` menu.
// `hideFloatingToolbar` / `hideFloatingLinkEditor`: no format popup over a selection, no link
// popup under a link (a caller with its own format bar, such as chat's composer).
export default function Lexicals ({value, hideControls, hideFloatingToolbar = false, hideFloatingLinkEditor = false, componentPicker = null, showBorder, onChange, bgColor, editable=false, id, theme: themeProp, styleName, isCollab, collabId, collabUsername, collabCursorColor, fileUploadInfo, onSetPageParam, plugins = null, placeholder = '', ariaLabel = '', placeholderClassName }) {
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

  // View mode renders static HTML first, then the live editor. Lexical fills its DOM
  // from the client, so the live editor alone server-renders an empty content-editable:
  // on the server this HTML is the content; in the browser the server's HTML is kept
  // through hydration (React never patches dangerouslySetInnerHTML), and the layout
  // effect swaps in the live editor before the next paint, which owns button actions and
  // collapsibles. See planning/tasks/current/ssr-lexical-view-html.md.
  const staticFirst = !editable && !isCollab;
  const [live, setLive] = React.useState(!staticFirst);
  React.useLayoutEffect(() => { if (!live) setLive(true); }, [live]);
  // The live editor mounts outside the document and is attached once its content is set. A page has
  // dozens of these. Lexical reads style and layout while it mounts (getComputedStyle on the root, the
  // DOM selection on every commit), and every editor's own DOM writes made the next one's reads
  // recalculate the whole page: ~160 ms apiece, 12 s on a page with 73. Writes to a detached tree
  // leave the page clean, so those reads cost nothing, and attaching the editors together is one
  // layout. Until then the server's HTML stays on screen. Both wrappers are `display: contents`, so
  // the editor's box sits in the layout where it always did.
  // planning/tasks/current/lexical-view-keep-empty-text-paragraphs.md
  const [shown, setShown] = React.useState(!staticFirst);
  const onContentSet = React.useCallback(() => showTogether(() => setShown(true)), []);
  const holder = React.useRef(null);
  const offPage = React.useMemo(() => {
    if (!staticFirst || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.style.display = 'contents';
    return el;
  }, [staticFirst]);
  React.useLayoutEffect(() => {
    if (shown && offPage && holder.current && offPage.parentNode !== holder.current) holder.current.appendChild(offPage);
  }, [shown, offPage]);

  const staticView = () => {
    const html = import.meta.env?.SSR && isLexicalJSON(value)
      ? getHtmlSync(value, undefined, undefined, { nestedTheme: nestedLexicalTheme, dmsTheme: theme })
      : '';
    return (
      <div className={`${nestedLexicalTheme.editorShell} ${showBorder ? 'border rounded-md' : ''}`}>
        <div className={nestedLexicalTheme.editorViewContainer || 'view-container'} style={{backgroundColor: bgColor}}>
          <div className={nestedLexicalTheme.viewScroller || 'view-scroller'}>
            <div className={nestedLexicalTheme.editor?.base || 'editor'}>
              <div
                className={nestedLexicalTheme.contentEditable}
                contentEditable={false}
                role="textbox"
                aria-readonly={true}
                // what Lexical sets on the live root: without break-word a long word sets the
                // column's min width, and a card in a grid row comes out wider than live
                style={{ userSelect: 'text', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                suppressHydrationWarning
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };
  // The static block keeps its place in the tree from the first render until the live editor is shown,
  // so React keeps the server's DOM node (and its HTML) instead of mounting an empty one.
  if (!live) return <>{staticView()}{null}</>;

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
            placeholderText={placeholder}
            ariaLabel={ariaLabel}
            placeholderClassName={placeholderClassName}
            hideFloatingToolbar={hideFloatingToolbar}
            componentPicker={componentPicker}
            hideFloatingLinkEditor={hideFloatingLinkEditor}
            hideControls={hideControls}
            onChange={onChange}
            bgColor={bgColor}
            editable={editable}
            theme={nestedLexicalTheme}
            fileUploadInfo={ fileUploadInfo }
            onContentSet={onContentSet}
          />
        )}
      </div>
      {plugins}
    </LexicalComposer>
  );

  const editorTree = (
    <PageActionsContext onSetPageParam={onSetPageParam}>
      <LexicalThemeContext.Provider value={theme}>
        {isCollab ? (
          <LexicalCollaboration>{inner}</LexicalCollaboration>
        ) : (
          inner
        )}
      </LexicalThemeContext.Provider>
    </PageActionsContext>
  );

  return (
    <>
    {shown ? null : staticView()}
    {offPage ? <div ref={holder} style={{ display: 'contents' }} /> : null}
    {offPage ? createPortal(editorTree, offPage) : editorTree}
    </>
  );
}

function UpdateEditor({ value, hideControls, onChange, bgColor, theme, editable, fileUploadInfo, placeholderText, ariaLabel, placeholderClassName, hideFloatingToolbar, hideFloatingLinkEditor, componentPicker, onContentSet }) {
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
            onContentSet?.();
            return;
        }

        if (isLexicalJSON(value)) {
            const newEditorState = editor.parseEditorState(value);
            // lexical calls flushSync that results in a warning. queueMicrotask is a fix for that.
            queueMicrotask(() => {
                editor.setEditorState(newEditorState);
                onContentSet?.();
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
            onContentSet?.();
        }
    }, [editor, value]);

    return (
        <>
            <Editor theme={theme} editable={editable} hideControls={hideControls} bgColor={bgColor} fileUploadInfo={ fileUploadInfo }
                    placeholderText={placeholderText} ariaLabel={ariaLabel} placeholderClassName={placeholderClassName}
                    hideFloatingToolbar={hideFloatingToolbar} hideFloatingLinkEditor={hideFloatingLinkEditor}
                    componentPicker={componentPicker}/>
            <OnChangePlugin onChange={onChange} />
        </>
    );
}
