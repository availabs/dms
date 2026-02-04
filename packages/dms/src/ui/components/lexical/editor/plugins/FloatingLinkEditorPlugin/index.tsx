/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
//import './index.css';

import {$isAutoLinkNode, $isLinkNode} from '@lexical/link';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$findMatchingParent, mergeRegister} from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  type GridSelection,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  type NodeSelection,
  type RangeSelection,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {type Dispatch, useCallback, useEffect, useRef, useState} from 'react';
import * as React from 'react';
import {createPortal} from 'react-dom';

import {getSelectedNode} from '../../utils/getSelectedNode';
import {setFloatingElemPositionForLinkEditor} from '../../utils/setFloatingElemPositionForLinkEditor';
import {sanitizeUrl} from '../../utils/url';
import { useLexicalTheme } from '../../../useLexicalTheme';
import {TOGGLE_LINK_COMMAND} from "../LinkPlugin";

function FloatingLinkEditor({
  editor,
  isLink,
  setIsLink,
  anchorElem,
  isLinkEditMode,
  setIsLinkEditMode,
}: {
  editor: LexicalEditor;
  isLink: boolean;
  setIsLink: Dispatch<boolean>;
  anchorElem: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}): JSX.Element {
  const theme = useLexicalTheme();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [editedLinkUrl, setEditedLinkUrl] = useState('https://');
  const [linkTarget, setLinkTarget] = useState('_self'); // default to _self
  const [lastSelection, setLastSelection] = useState<
    RangeSelection | GridSelection | NodeSelection | null
  >(null);

  const updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      if ($isLinkNode(parent)) {
        setLinkUrl(parent.getURL());
        if ('getTarget' in parent) {
          setLinkTarget(parent.getTarget());
        } else {
          setLinkTarget('_self');
        }
      } else if ($isLinkNode(node)) {
        setLinkUrl(node.getURL());
        if ('getTarget' in node) {
          setLinkTarget(node.getTarget());
        } else {
          setLinkTarget('_self');
        }
      } else {
        setLinkUrl('');
        setLinkTarget('_self');
      }
    }
    const editorElem = editorRef.current;
    const nativeSelection = window.getSelection();
    const activeElement = document.activeElement;

    if (editorElem === null) {
      return;
    }

    const rootElement = editor.getRootElement();

    if (
      selection !== null &&
      nativeSelection !== null &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode) &&
      editor.isEditable()
    ) {
      const domRect: DOMRect | undefined =
        nativeSelection.focusNode?.parentElement?.getBoundingClientRect();
      if (domRect) {
        domRect.y += 40;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      setLastSelection(selection);
    } else if (!activeElement || activeElement.className !== (theme.linkEditor_linkInput_base)) {
      if (rootElement !== null) {
        setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
      }
      setLastSelection(null);
      setIsLinkEditMode && setIsLinkEditMode(false);
      setLinkUrl('');
    }

    return true;
  }, [anchorElem, editor, setIsLinkEditMode]);

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.getEditorState().read(() => {
        updateLinkEditor();
      });
    };

    window.addEventListener('resize', update);

    if (scrollerElem) {
      scrollerElem.addEventListener('scroll', update);
    }

    return () => {
      window.removeEventListener('resize', update);

      if (scrollerElem) {
        scrollerElem.removeEventListener('scroll', update);
      }
    };
  }, [anchorElem.parentElement, editor, updateLinkEditor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          updateLinkEditor();
        });
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateLinkEditor();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isLink) {
            setIsLink(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, updateLinkEditor, setIsLink, isLink]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateLinkEditor();
    });
  }, [editor, updateLinkEditor]);

  useEffect(() => {
    if (isLinkEditMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLinkEditMode, isLink]);

  const monitorInputInteraction = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLinkSubmission();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsLinkEditMode && setIsLinkEditMode(false);
    }
  };

  const handleLinkSubmission = () => {
    if (lastSelection !== null) {
      const sanitized = sanitizeUrl(editedLinkUrl.trim());
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url: sanitized, target: linkTarget });

      // if (linkTarget === '_blank') {
      //   editor.dispatchCommand(TOGGLE_EXTERNAL_LINK_COMMAND, sanitized);
      // } else {
      //   editor.dispatchCommand(TOGGLE_INTERNAL_LINK_COMMAND, sanitized);
      // }

      setEditedLinkUrl('https://');
      setIsLinkEditMode && setIsLinkEditMode(false);
    }
  };


  return (
    <div ref={editorRef} className={theme.linkEditor_base || "link-editor z-[50]"}>
      {!isLink ? null : isLinkEditMode ? (
        <>
          <input
            ref={inputRef}
            className={theme.linkEditor_linkInput_base || "link-input"}
            value={editedLinkUrl}
            onChange={(event) => {
              setEditedLinkUrl(event.target.value);
            }}
            onKeyDown={(event) => {
              monitorInputInteraction(event);
            }}
          />
          <select
              className={theme.linkEditor_linkInput_base || 'link-input'}
              value={linkTarget}
              onChange={(event) => {
                setLinkTarget(event.target.value);
              }}
          >
            <option value="_self">Same tab (_self)</option>
            <option value="_blank">New tab (_blank)</option>
          </select>
          <div>
            <div
              className={theme.linkEditor_div_linkCancel || "link-cancel"}
              role="button"
              tabIndex={0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setIsLinkEditMode && setIsLinkEditMode(false);
              }}
            />
            <div
              className={theme.linkEditor_div_linkConfirm || "link-confirm"}
              role="button"
              tabIndex={0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleLinkSubmission}
            />
          </div>
        </>
      ) : (
        <div className={theme.linkEditor_linkView_base || "link-view"}>
          <a
            className={theme.linkEditor_linkView_a}
            href={sanitizeUrl(linkUrl)}
            target="_blank"
            rel="noopener noreferrer">
            {linkUrl}
          </a>
          <div
            className={theme.linkEditor_div_linkEdit || "link-edit"}
            role="button"
            tabIndex={0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setEditedLinkUrl(linkUrl || 'https://');
              setIsLinkEditMode && setIsLinkEditMode(true);
            }}
          />
          <div
            className={theme.linkEditor_div_linkTrash || "link-trash"}
            role="button"
            tabIndex={0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, {});
            }}
          />
        </div>
      )}
    </div>
  );
}

function useFloatingLinkEditorToolbar(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isLinkEditMode: boolean,
  setIsLinkEditMode: Dispatch<boolean>,
): JSX.Element | null {
  const [activeEditor, setActiveEditor] = useState(editor);
  const [isLink, setIsLink] = useState(false);

  useEffect(() => {
    function updateToolbar() {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const node = getSelectedNode(selection);
        const linkParent = $findMatchingParent(node, $isLinkNode);
        const autoLinkParent = $findMatchingParent(node, $isAutoLinkNode);
        // We don't want this menu to open for auto links.
        if (linkParent !== null && autoLinkParent === null) {
          setIsLink(true);
        } else {
          setIsLink(false);
        }
      }
    }
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          updateToolbar();
          setActiveEditor(newEditor);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        (payload) => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = getSelectedNode(selection);
            const linkNode = $findMatchingParent(node, $isLinkNode);
            if ($isLinkNode(linkNode) && (payload.metaKey || payload.ctrlKey)) {
              window.open(linkNode.getURL(), '_blank');
              return true;
            }
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return createPortal(
    <FloatingLinkEditor
      editor={activeEditor}
      isLink={isLink}
      anchorElem={anchorElem}
      setIsLink={setIsLink}
      isLinkEditMode={isLinkEditMode}
      setIsLinkEditMode={setIsLinkEditMode}
    />,
    anchorElem,
  );
}

export default function FloatingLinkEditorPlugin({
  anchorElem = document.body,
  isLinkEditMode,
  setIsLinkEditMode,
}: {
  anchorElem?: HTMLElement;
  isLinkEditMode: boolean;
  setIsLinkEditMode: Dispatch<boolean>;
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  return useFloatingLinkEditorToolbar(
    editor,
    anchorElem,
    isLinkEditMode,
    setIsLinkEditMode,
  );
}
