/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {DRAG_DROP_PASTE} from '@lexical/rich-text';
import {isMimeType, mediaFileReader} from '@lexical/utils';
import {COMMAND_PRIORITY_LOW} from 'lexical';
import {useEffect} from 'react';

import {INSERT_INLINE_IMAGE_COMMAND} from '../InlineImagePlugin';

const ACCEPTABLE_IMAGE_TYPES = [
  'image/',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/webp'
];

export default function DragDropPaste({ fileUploadInfo }): null {

// console.log("DragDropPaste::fileUploadInfo", fileUploadInfo);

  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {

        (async () => {
          const filesResult = await mediaFileReader(
            files,
            [...ACCEPTABLE_IMAGE_TYPES],
          );
          for (const { file, result } of filesResult) {

// console.log("DragDropPaste::DISPATCHING??????????????????")

            editor.dispatchCommand(INSERT_INLINE_IMAGE_COMMAND, {
              altText: file.name,
              src: result,
              position: "left",
              fileUploadInfo
            });
          }
        })();

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, fileUploadInfo]);

  return null;
}
