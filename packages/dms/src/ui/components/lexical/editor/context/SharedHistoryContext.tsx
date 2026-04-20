/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {createEmptyHistoryState} from '@lexical/react/LexicalHistoryPlugin';
import * as React from 'react';
import {type ReactNode, useMemo} from 'react';
import {SharedHistoryContextInternal} from './useSharedHistoryContext';

export const SharedHistoryContext = ({
  children,
}: {
  children: ReactNode;
}): JSX.Element => {
  const historyContext = useMemo(
    () => ({historyState: createEmptyHistoryState()}),
    [],
  );
  return <SharedHistoryContextInternal.Provider value={historyContext}>{children}</SharedHistoryContextInternal.Provider>;
};
