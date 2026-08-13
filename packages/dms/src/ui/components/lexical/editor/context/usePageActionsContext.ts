import { createContext, useContext } from 'react';
import * as React from 'react';

// Carries app-level page callbacks (e.g. "set a page action param") down into
// decorator-node components (ButtonNode's ButtonComponent) without those
// components importing patterns/page context directly — see ButtonNode.tsx's
// handleClick. Populated by <PageActionsContext> in editor/index.tsx from a
// plain prop the pattern-layer host passes into Lexical.EditComp/ViewComp.
export type PageActionsContextShape = {
  onSetPageParam?: (key: string, value: unknown) => void;
};

export const PageActionsContextInternal: React.Context<PageActionsContextShape> = createContext({});

export const usePageActionsContext = (): PageActionsContextShape => {
  return useContext(PageActionsContextInternal);
};
