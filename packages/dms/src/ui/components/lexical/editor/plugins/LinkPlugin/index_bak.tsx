import * as React from 'react';
import {
    LinkPlugin as LexicalLinkPlugin
} from '@lexical/react/LexicalLinkPlugin';
import {TOGGLE_LINK_COMMAND} from '@lexical/link'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useEffect} from 'react';
import {mergeRegister} from '@lexical/utils';
import {COMMAND_PRIORITY_EDITOR, createCommand} from 'lexical';

import {validateUrl} from '../../utils/url';

// New custom command for internal links
export const TOGGLE_INTERNAL_LINK_COMMAND = createCommand<string | null>();

export default function InternalLinkPlugin(): JSX.Element {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                TOGGLE_INTERNAL_LINK_COMMAND,
                (payload: string | null) => {
                    editor.dispatchCommand(TOGGLE_LINK_COMMAND, payload);
                    return true;
                },
                COMMAND_PRIORITY_EDITOR,
            ),
        );
    }, [editor]);

    return <LexicalLinkPlugin validateUrl={validateUrl} attributes={{target: '_self'}} />;
}
