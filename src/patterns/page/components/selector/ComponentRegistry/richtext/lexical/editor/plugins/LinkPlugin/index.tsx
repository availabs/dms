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

// Command accepts an object with url and target
export const TOGGLE_LINK_COMMAND = createCommand<{ url: string | null; target?: string }>();

export default function LinkPlugin(): JSX.Element {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                TOGGLE_LINK_COMMAND,
                (payload) => {
                    if (!payload || !payload.url) return false;
                    const { url, target = '_self' } = payload;

                    editor.update(() => {
                        const selection = $getSelection();
                        if (!$isRangeSelection(selection)) return;

                        const selectedText = selection.getTextContent();

                        // Try to update existing link nodes
                        const nodes = selection.getNodes();

                        for (const node of nodes) {
                            const parent = node.getParent();
                            if ($isLinkNode(parent)) {
                                parent.setURL(url);
                                parent.setTarget(target);
                                return;
                            }
                            if ($isLinkNode(node)) {
                                node.setURL(url);
                                node.setTarget(target);
                                return;
                            }
                        }

                        // Create a new link node with the selected text inside
                        const linkNode = $createLinkNode(url, { target });
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
