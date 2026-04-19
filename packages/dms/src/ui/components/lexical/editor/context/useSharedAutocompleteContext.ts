import * as React from 'react';
import {createContext, useContext, useEffect, useState} from 'react';

type Suggestion = null | string;
type CallbackFn = (newSuggestion: Suggestion) => void;
type SubscribeFn = (callbackFn: CallbackFn) => () => void;
type PublishFn = (newSuggestion: Suggestion) => void;
export type ContextShape = [SubscribeFn, PublishFn];
type HookShape = [suggestion: Suggestion, setSuggestion: PublishFn];

export const SharedAutocompleteContextInternal: React.Context<ContextShape> = createContext<ContextShape>([
  (_cb) => () => {
    return _cb;
  },
  (_newSuggestion: Suggestion) => {
    return _newSuggestion;
  },
]);

export const useSharedAutocompleteContext = (): HookShape => {
  const [subscribe, publish]: ContextShape = useContext(SharedAutocompleteContextInternal);
  const [suggestion, setSuggestion] = useState<Suggestion>(null);
  useEffect(() => {
    return subscribe((newSuggestion: Suggestion) => {
      setSuggestion(newSuggestion);
    });
  }, [subscribe]);
  return [suggestion, publish];
};
