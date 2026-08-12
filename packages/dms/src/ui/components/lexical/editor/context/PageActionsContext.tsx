/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from 'react';
import {type ReactNode, useMemo} from 'react';
import {PageActionsContextInternal, type PageActionsContextShape} from './usePageActionsContext';

export const PageActionsContext = ({
  onSetPageParam,
  children,
}: PageActionsContextShape & {
  children: ReactNode;
}): JSX.Element => {
  const value = useMemo(() => ({onSetPageParam}), [onSetPageParam]);
  return <PageActionsContextInternal.Provider value={value}>{children}</PageActionsContextInternal.Provider>;
};
