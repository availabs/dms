import type {HistoryState} from '@lexical/react/LexicalHistoryPlugin';
import {createContext, useContext} from 'react';
import * as React from 'react';

export type ContextShape = {
  historyState?: HistoryState;
};

export const SharedHistoryContextInternal: React.Context<ContextShape> = createContext({});

export const useSharedHistoryContext = (): ContextShape => {
  return useContext(SharedHistoryContextInternal);
};
