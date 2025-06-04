import * as React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { mergeRegister } from '@lexical/utils';
import {
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
} from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';

export const TOGGLE_EXTERNAL_LINK_COMMAND = createCommand<string | null>();

export default function ExternalLinkPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
        editor.registerCommand(
            TOGGLE_EXTERNAL_LINK_COMMAND,
            (url: string | null) => {
              if (!url) return false;

              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;

                const selectedText = selection.getTextContent();

                // Try to find an existing link node to update
                const nodes = selection.getNodes();

                for (const node of nodes) {
                  const parent = node.getParent();
                  if ($isLinkNode(parent)) {
                    parent.setURL(url);
                    parent.setTarget('_blank');
                    return;
                  }

                  if ($isLinkNode(node)) {
                    node.setURL(url);
                    node.setTarget('_blank');
                    return;
                  }
                }

                // No existing link found - create a new one and insert selected text inside
                const linkNode = $createLinkNode(url, { target: '_blank' });
                linkNode.append($createTextNode(selectedText));

                // Replace selection with the new link node
                selection.insertNodes([linkNode]);
              });

              return true;
            },
            COMMAND_PRIORITY_EDITOR
        )
    );
  }, [editor]);

  return null;
}
