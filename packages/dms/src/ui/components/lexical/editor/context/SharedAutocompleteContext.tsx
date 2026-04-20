/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from 'react';
import {type ReactNode, useMemo} from 'react';
import {SharedAutocompleteContextInternal, type ContextShape} from './useSharedAutocompleteContext';

type Suggestion = null | string;
type CallbackFn = (newSuggestion: Suggestion) => void;

export const SharedAutocompleteContext = ({
  children,
}: {
  children: ReactNode;
}): JSX.Element => {
  const context: ContextShape = useMemo(() => {
    let suggestion: Suggestion | null = null;
    const listeners: Set<CallbackFn> = new Set();
    return [
      (cb: (newSuggestion: Suggestion) => void) => {
        cb(suggestion);
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      (newSuggestion: Suggestion) => {
        suggestion = newSuggestion;
        for (const listener of listeners) {
          listener(newSuggestion);
        }
      },
    ];
  }, []);
  return <SharedAutocompleteContextInternal.Provider value={context}>{children}</SharedAutocompleteContextInternal.Provider>;
};
