/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $findMatchingParent,
  $insertNodeToNearestRoot,
  mergeRegister,
} from '@lexical/utils';
import {
  $createParagraphNode,
  $getPreviousSelection,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DELETE_CHARACTER_COMMAND,
  ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  LexicalNode,
  NodeKey,
} from 'lexical';
import {useEffect} from 'react';

import {
  $createCollapsibleContainerNode,
  $isCollapsibleContainerNode,
  CollapsibleNoPreviewContainerNode,
} from './CollapsibleNoPreviewContainerNode';
import {
  $createCollapsibleContentNode,
  $isCollapsibleContentNode,
  CollapsibleNoPreviewContentNode,
} from './CollapsibleNoPreviewContentNode';
import {
  $createCollapsibleTitleNode,
  $isCollapsibleTitleNode,
  CollapsibleNoPreviewTitleNode,
} from './CollapsibleNoPreviewTitleNode';

// import {
//   $createCollapsibleButtonNode,
//   $isCollapsibleButtonNode,
//   // CollapsibleNoPreviewButtonNode,
// } from './CollapsibleNoPreviewToggleButtonNode';

export const INSERT_COLLAPSIBLE_NO_PREVIEW_COMMAND = createCommand<void>();
export const TOGGLE_COLLAPSIBLE_NO_PREVIEW_COMMAND = createCommand<NodeKey>();


export default function CollapsibleNoPreviewPlugin({editable}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (
      !editor.hasNodes([
        CollapsibleNoPreviewContainerNode,
        CollapsibleNoPreviewTitleNode,
        CollapsibleNoPreviewContentNode,
          // CollapsibleNoPreviewButtonNode
      ])
    ) {
      throw new Error(
          'CollapsiblePlugin: Required collapsible nodes not registered on editor',
      );
    }

    const onEscapeUp = () => {
      const selection = $getSelection();
      if (
        $isRangeSelection(selection) &&
        selection.isCollapsed() &&
        selection.anchor.offset === 0
      ) {
        const container = $findMatchingParent(
          selection.anchor.getNode(),
          $isCollapsibleContainerNode,
        );

        if ($isCollapsibleContainerNode(container)) {
          const parent = container.getParent<ElementNode>();
          if (
            parent !== null &&
            parent.getFirstChild<LexicalNode>() === container &&
            selection.anchor.key ===
              container.getFirstDescendant<LexicalNode>()?.getKey()
          ) {
            container.insertBefore($createParagraphNode());
          }
        }
      }

      return false;
    };

    const onEscapeDown = () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && selection.isCollapsed()) {
        const container = $findMatchingParent(
          selection.anchor.getNode(),
          $isCollapsibleContainerNode,
        );

        if ($isCollapsibleContainerNode(container)) {
          const parent = container.getParent<ElementNode>();
          if (
            parent !== null &&
            parent.getLastChild<LexicalNode>() === container
          ) {
            const lastDescendant = container.getLastDescendant<LexicalNode>();
            if (
              lastDescendant !== null &&
              selection.anchor.key === lastDescendant.getKey() &&
              selection.anchor.offset === lastDescendant.getTextContentSize()
            ) {
              container.insertAfter($createParagraphNode());
            }
          }
        }
      }

      return false;
    };

    return mergeRegister(
        // editor.registerNodeTransform(CollapsibleNoPreviewContainerNode, (node) => {
        //     const children = node.getChildren<LexicalNode>();
        //     if (!children.some($isCollapsibleButtonNode)) {
        //         node.append($createCollapsibleButtonNode());
        //     }
        // }),

        editor.registerCommand(
            INSERT_COLLAPSIBLE_NO_PREVIEW_COMMAND,
            () => {
                editor.update(() => {
                    const title = $createCollapsibleTitleNode();
                    const content = $createCollapsibleContentNode().append($createParagraphNode());
                    const container = $createCollapsibleContainerNode(true).append(title, content);
                    $insertNodeToNearestRoot(container);
                    title.select();
                });
                return true;
            },
            COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
            TOGGLE_COLLAPSIBLE_NO_PREVIEW_COMMAND,
            (nodeKey) => {
                editor.update(() => {
                    const node = editor.getNodeByKey(nodeKey);
                    if ($isCollapsibleContainerNode(node)) {
                        node.toggleCollapsed();
                    }
                });
                return true;
            },
            COMMAND_PRIORITY_LOW
        )
    );
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
        // Existing node transforms...
        editor.registerNodeTransform(CollapsibleNoPreviewContentNode, (node) => {
          const dom = editor.getElementByKey(node.getKey());
          if (!dom) return; // Ensure the DOM element exists

          const button = dom.querySelector('.collapsible-toggle');
          if (button) {
            dom.appendChild(button); // Move button to the bottom of content
          }
        })
    );
  }, [editable]);


  return null;
}
