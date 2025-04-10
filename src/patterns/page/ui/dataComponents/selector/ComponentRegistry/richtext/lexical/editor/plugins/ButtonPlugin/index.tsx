/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

//import '../../ui/Checkbox.css';

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$wrapNodeInElement, mergeRegister} from '@lexical/utils';
import {
  $createParagraphNode,
  $createRangeSelection,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  LexicalCommand,
  LexicalEditor,
} from 'lexical';
import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {CAN_USE_DOM} from '../../shared/canUseDOM';

import {
  $createButtonNode,
  $isButtonNode,
  ButtonNode,
  ButtonPayload,
} from '../../nodes/ButtonNode';

import Button from '../../ui/Button';
import { DialogActions } from '../../ui/Dialog';
import FileInput from '../../ui/FileInput';
import Select from '../../ui/Select';
import TextInput from '../../ui/TextInput';

export type InsertButtonPayload = Readonly<ButtonPayload>;

const getDOMSelection = (targetWindow: Window | null): Selection | null =>
  CAN_USE_DOM ? (targetWindow || window).getSelection() : null;

export const INSERT_BUTTON_COMMAND: LexicalCommand<ButtonPayload> =
  createCommand('INSERT_BUTTON_COMMAND');

export function InsertButtonDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const hasModifier = useRef(false);

  const [linkText, setLinkText] = useState('submit');
  const [path, setPath] = useState('#');
  const [style, setStyle] = useState('primary');

  useEffect(() => {
    hasModifier.current = false;
    const handler = (e: KeyboardEvent) => {
      hasModifier.current = e.altKey;
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [activeEditor]);

  const handleOnClick = () => {
    const payload = {linkText, path, style};
    activeEditor.dispatchCommand(INSERT_BUTTON_COMMAND, payload);
    onClose();
  };

  const isDisabled = React.useMemo(() => linkText?.length === 0 || path?.length === 0, [linkText,path])

  return (
    <>
      <div style={{marginBottom: '1em'}}>
        <TextInput
          label="Button Text"
          placeholder=""
          onChange={e => {
            //console.log('button text',e)
            setLinkText(e)
            }
          }
          value={linkText}
          data-test-id="image-modal-alt-text-input"
        />
      </div>

      <div style={{marginBottom: '1em'}}>
        <TextInput
          label="URL"
          placeholder="LinkPath"
          onChange={setPath}
          value={path}
          data-test-id="image-modal-alt-text-input"
        />
      </div>

      <Select
        style={{marginBottom: '1em', width: '290px'}}
        label="Position"
        name="position"
        id="position-select"
        onChange={e => setStyle(e.target.value)}>
        <option value="primary">Primary</option>
        <option value="secondary">Secondary</option>
        <option value="primarySmall">Primary Small</option>
        <option value="secondarySmall">Secondary Small</option>
      </Select>

      <DialogActions>
        <Button
          data-test-id="create-button-node"
          disabled={isDisabled}
          onClick={() => handleOnClick()}>
          Confirm
        </Button>
      </DialogActions>
    </>
  );
}

export default function ButtonPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ButtonNode])) {
      throw new Error('ButtonPlugin: ImageNode not registered on editor');
    }

    return mergeRegister(
      editor.registerCommand<ButtonPayload>(
        INSERT_BUTTON_COMMAND,
        (payload) => {
          const buttonNode = $createButtonNode(payload);
          $insertNodes([buttonNode]);
          $wrapNodeInElement(buttonNode, $createParagraphNode).selectEnd();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      )
    );
  }, [editor]);

  return null;
}




