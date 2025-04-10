/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// import './Placeholder.css';

import * as React from 'react';
import {ReactNode} from 'react';

export default function Placeholder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <div className={className || 'text-[15px] text-[#999] overflow-hidden absolute overflow-ellipsis top-[8px] left-[8px] lg:left-[28px] right-[28px] select-none whitespace-nowrap inline-block pointer-events-none'}>{children}</div>;
}
