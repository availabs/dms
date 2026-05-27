/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type {Position} from '../../nodes/InlineImageNode';

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
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';
import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {CAN_USE_DOM} from '../../shared/canUseDOM';

import {
  $createInlineImageNode,
  $isInlineImageNode,
  InlineImageNode,
  type InlineImagePayload,
} from '../../nodes/InlineImageNode';
import FileInput from '../../ui/FileInput';
import { ThemeContext } from '../../../../../useTheme';

export type InsertInlineImagePayload = Readonly<InlineImagePayload>;

const getDOMSelection = (targetWindow: Window | null): Selection | null =>
  CAN_USE_DOM ? (targetWindow || window).getSelection() : null;

export const INSERT_INLINE_IMAGE_COMMAND: LexicalCommand<InlineImagePayload> =
  createCommand('INSERT_INLINE_IMAGE_COMMAND');

export function InsertInlineImageDialog({
  activeEditor,
  onClose,
  fileUploadInfo
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
  fileUploadInfo: object | null
}): JSX.Element {
  // const hasModifier = useRef(false);

// console.log("InsertInlineImageDialog::fileUploadInfo", fileUploadInfo);

  const { UI } = React.useContext(ThemeContext) || {};
  const Input = UI?.Input;
  const Button = UI?.Button;
  const Switch = UI?.Switch;
  const Select = UI?.Select;
  const DialogActions = UI?.DialogActions
    || (({children}: {children: React.ReactNode}) => <div className="flex justify-end gap-2 mt-4">{children}</div>);

  const [src, setSrc] = useState('');
  const [file, setFile] = useState(null);
  const [altText, setAltText] = useState('');
  const [showCaption, setShowCaption] = useState(false);
  const [position, setPosition] = useState<Position>('left');

  const isDisabled = src === '';

  const POSITION_OPTIONS = [
    { label: 'Left',       value: 'left'  },
    { label: 'Right',      value: 'right' },
    { label: 'Full Width', value: 'full'  },
  ];

  const loadImage = (files: FileList | null) => {

    const reader = new FileReader();
    reader.onload = function () {

// console.log("InsertInlineImageDialog::loadImage::reader.result", reader.result)

      if (typeof reader.result === 'string') {
        setSrc(reader.result);
      }
      return '';
    };
    if (files !== null) {
      reader.readAsDataURL(files[0]);
      setFile(files[0]);
    }
  };

  // useEffect(() => {
  //   if(typeof document === 'undefined') return;

  //   hasModifier.current = false;
  //   const handler = (e: KeyboardEvent) => {
  //     hasModifier.current = e.altKey;
  //   };
  //   // document?.addEventListener('keydown', handler);
  //   // return () => {
  //   //   document?.removeEventListener('keydown', handler);
  //   // };
  // }, [activeEditor]);

  const handleOnClick = () => {
    const payload = {
      altText, position, showCaption, src,
      fileUploadInfo,
      fileName: `${ file.name }|${ file.size }`
    };
    activeEditor.dispatchCommand(INSERT_INLINE_IMAGE_COMMAND, payload);
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <FileInput
          label="Image Upload"
          onChange={loadImage}
          accept="image/*"
          data-test-id="image-modal-file-upload"
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Alt Text</span>
        {Input ? (
          <Input
            value={altText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAltText(e.target.value)}
            placeholder="Descriptive alternative text"
            data-test-id="image-modal-alt-text-input"
          />
        ) : (
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Descriptive alternative text"
            className="border px-2 py-1"
            data-test-id="image-modal-alt-text-input"
          />
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Position</span>
        {Select ? (
          <Select
            options={POSITION_OPTIONS}
            value={position}
            onChange={(next: string) => { if (next) setPosition(next as Position); }}
          />
        ) : (
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as Position)}
            className="border px-2 py-1">
            {POSITION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        {Switch ? (
          <Switch
            checked={showCaption}
            onChange={(checked: boolean) => setShowCaption(checked)}
          />
        ) : (
          <input
            type="checkbox"
            checked={showCaption}
            onChange={(e) => setShowCaption(e.target.checked)}
          />
        )}
        <span className="text-sm">Show Caption</span>
      </label>

      <DialogActions>
        {Button ? (
          <Button
            data-test-id="image-modal-file-upload-btn"
            disabled={isDisabled}
            onClick={() => handleOnClick()}>
            Confirm
          </Button>
        ) : (
          <button
            disabled={isDisabled}
            onClick={() => handleOnClick()}
            className="px-3 py-1.5 bg-slate-800 text-white">
            Confirm
          </button>
        )}
      </DialogActions>
    </div>
  );
}

export default function InlineImagePlugin({ fileUploadInfo }): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([InlineImageNode])) {
      throw new Error('ImagesPlugin: ImageNode not registered on editor');
    }

    return mergeRegister(
      editor.registerCommand<InsertInlineImagePayload>(
        INSERT_INLINE_IMAGE_COMMAND,
        (payload) => {

console.log("INSERT_INLINE_IMAGE_COMMAND::payload", payload)

          const imageNode = $createInlineImageNode({ ...payload, fileUploadInfo });
          $insertNodes([imageNode]);
          if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
            $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd();
          }

          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand<DragEvent>(
        DRAGSTART_COMMAND,
        (event) => {
          return onDragStart(event);
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand<DragEvent>(
        DRAGOVER_COMMAND,
        (event) => {
          return onDragover(event);
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<DragEvent>(
        DROP_COMMAND,
        (event) => {
          return onDrop(event, editor);
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}

const TRANSPARENT_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const img = typeof document !== 'undefined' ? document.createElement('img') : {};
img.src = TRANSPARENT_IMAGE;

function onDragStart(event: DragEvent): boolean {
  const node = getImageNodeInSelection();
  if (!node) {
    return false;
  }
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) {
    return false;
  }
  dataTransfer.setData('text/plain', '_');
  dataTransfer.setDragImage(img, 0, 0);
  dataTransfer.setData(
    'application/x-lexical-drag',
    JSON.stringify({
      data: {
        altText: node.__altText,
        caption: node.__caption,
        height: node.__height,
        key: node.getKey(),
        showCaption: node.__showCaption,
        src: node.__src,
        width: node.__width,
        fileUploadInfo: node.__fileUploadInfo,
        fileName: node.__fileName
      },
      type: 'image',
    }),
  );

  return true;
}

function onDragover(event: DragEvent): boolean {
  const node = getImageNodeInSelection();
  if (!node) {
    return false;
  }
  if (!canDropImage(event)) {
    event.preventDefault();
  }
  return true;
}

function onDrop(event: DragEvent, editor: LexicalEditor): boolean {
  const node = getImageNodeInSelection();
  if (!node) {
    return false;
  }
  const data = getDragImageData(event);
  if (!data) {
    return false;
  }
  event.preventDefault();
  if (canDropImage(event)) {
    const range = getDragSelection(event);
    node.remove();
    const rangeSelection = $createRangeSelection();
    if (range !== null && range !== undefined) {
      rangeSelection.applyDOMRange(range);
    }
    $setSelection(rangeSelection);
    editor.dispatchCommand(INSERT_INLINE_IMAGE_COMMAND, data);
  }
  return true;
}

function getImageNodeInSelection(): InlineImageNode | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) {
    return null;
  }
  const nodes = selection.getNodes();
  const node = nodes[0];
  return $isInlineImageNode(node) ? node : null;
}

function getDragImageData(event: DragEvent): null | InsertInlineImagePayload {
  const dragData = event.dataTransfer?.getData('application/x-lexical-drag');
  if (!dragData) {
    return null;
  }
  const {type, data} = JSON.parse(dragData);
  if (type !== 'image') {
    return null;
  }

  return data;
}

declare global {
  interface DragEvent {
    rangeOffset?: number;
    rangeParent?: Node;
  }
}

function canDropImage(event: DragEvent): boolean {
  const target = event.target;
  return !!(
    target &&
    target instanceof HTMLElement &&
    !target.closest('code, span.editor-image') &&
    target.parentElement &&
    target.parentElement.closest('div.ContentEditable__root')
  );
}

function getDragSelection(event: DragEvent): Range | null | undefined {
  let range;
  const target = event.target as null | Element | Document;
  const targetWindow =
    target == null
      ? null
      : target.nodeType === 9
      ? (target as Document).defaultView
      : (target as Element).ownerDocument.defaultView;
  const domSelection = getDOMSelection(targetWindow);
  if (document?.caretRangeFromPoint) {
    range = document?.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (event.rangeParent && domSelection !== null) {
    domSelection.collapse(event.rangeParent, event.rangeOffset || 0);
    range = domSelection.getRangeAt(0);
  } else {
    throw Error('Cannot get the selection when dragging');
  }

  return range;
}
