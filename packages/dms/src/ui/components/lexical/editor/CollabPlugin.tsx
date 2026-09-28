/**
 * Lexical collaboration (yjs) — mounted only when an editor runs in collab
 * mode. Its own module so editor.tsx can code-split it: yjs, y-protocols,
 * @lexical/yjs and the sync manager stay out of every page's eager bundle
 * (view mode never collaborates). See
 * planning/tasks/completed/bundle-split-initial-graph.md.
 */
import * as React from 'react';
import {CollaborationPlugin} from '@lexical/react/LexicalCollaborationPlugin';
import {createCollabProvider} from './collaboration';

export default function CollabPlugin(props): JSX.Element {
    return <CollaborationPlugin {...props} providerFactory={createCollabProvider} />;
}
