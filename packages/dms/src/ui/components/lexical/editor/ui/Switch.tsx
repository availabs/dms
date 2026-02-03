/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from 'react';
import {useMemo} from 'react';
import { useLexicalTheme } from '../../useLexicalTheme';
import { ThemeContext } from '../../../../useTheme';

export default function Switch({
  checked,
  onClick,
  text,
  id,
}: Readonly<{
  checked: boolean;
  id?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  text: string;
}>): JSX.Element {
  const { theme: contextTheme } = React.useContext(ThemeContext) || {};
  const theme = useLexicalTheme(contextTheme);
  const buttonId = useMemo(() => 'id_' + Math.floor(Math.random() * 10000), []);
  return (
    <div className={theme.switch_base} id={id}>
      <label className={theme.switch_label} htmlFor={buttonId}>{text}</label>
      <button
        role="switch"
        aria-checked={checked}
        id={buttonId}
        onClick={onClick}>
        <span />
      </button>
    </div>
  );
}
