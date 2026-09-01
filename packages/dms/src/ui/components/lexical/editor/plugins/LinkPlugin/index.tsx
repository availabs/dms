import * as React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { mergeRegister } from '@lexical/utils';
import {
    COMMAND_PRIORITY_EDITOR,
    $getSelection,
    $isRangeSelection,
    $createTextNode,
} from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { TOGGLE_LINK_COMMAND } from './commands';

export default function LinkPlugin(): JSX.Element {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                TOGGLE_LINK_COMMAND,
                (payload) => {
                    const { url, target = '_self' } = payload;
                    // New-tab links must not leak window.opener (reverse tabnabbing).
                    const rel = target === '_blank' ? 'noopener noreferrer' : null;

                    editor.update(() => {
                        const selection = $getSelection();
                        const nodes = selection.getNodes();
                        if (!$isRangeSelection(selection)) return;

                        const selectedText = selection.getTextContent();
                        if (!payload || !payload.url) {
                            for (const node of nodes) {
                                const parent = node.getParent();

                                if ($isLinkNode(parent)) {
                                    parent.insertAfter(node);
                                    parent.remove();
                                } else if ($isLinkNode(node)) {
                                    node.remove();
                                    selection.insertText(node.getTextContent());
                                }
                            }

                            return;
                        }else{
                            // If the selection/caret is already inside an existing link
                            // (e.g. editing via the floating link editor), just update its
                            // fields in place — do not insert a new node, since insertNodes
                            // at a caret splits the surrounding link/text node in two.
                            for (const node of nodes) {
                                const parent = node.getParent();
                                if ($isLinkNode(parent)) {
                                    parent.setURL(url);
                                    parent.setTarget(target);
                                    parent.setRel(rel);
                                    return;
                                }
                                if ($isLinkNode(node)) {
                                    node.setURL(url);
                                    node.setTarget(target);
                                    node.setRel(rel);
                                    return;
                                }
                            }

                            // Otherwise, wrap the newly selected plain text in a new link node.
                            const linkNode = $createLinkNode(url, { target, rel });
                            linkNode.append($createTextNode(selectedText));
                            selection.insertNodes([linkNode]);
                        }
                    });

                    return true;
                },
                COMMAND_PRIORITY_EDITOR
            )
        );
    }, [editor]);

    return null;
}
