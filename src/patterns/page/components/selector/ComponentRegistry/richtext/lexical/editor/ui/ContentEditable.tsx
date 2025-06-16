/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import * as React from 'react';

export default function LexicalContentEditable(props) {
  const { className,editor } = props
  const theme = editor?._config?.theme || {}
  return <ContentEditable className={className || theme?.contentEditable} />;
}
