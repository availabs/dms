/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';

import {LexicalEditor} from 'lexical';
import * as React from 'react';
import {useState} from 'react';

import Button from '../../ui/Button';
import DropDown, {DropDownItem} from '../../ui/DropDown';
import {INSERT_LAYOUT_COMMAND} from './LayoutPlugin';
import theme from "../../themes/PlaygroundEditorTheme";

export const LAYOUTS = [
  {label: '2 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2', count: 2},
  {label: '2 columns (25% - 75%)', value: 'grid-cols-1 md:grid-cols-[1fr_3fr]', count:2},
  {label: '3 columns (equal width)', value: 'grid-cols-1 md:grid-cols-3', count: 3},
  {label: '3 columns (25% - 50% - 25%)', value: 'grid-cols-1 md:grid-cols-[1fr_2fr_1fr]', count: 3},
  {label: '4 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4', count: 4},
];

export default function InsertLayoutDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const [layout, setLayout] = useState(LAYOUTS[0].value);
  const buttonLabel = LAYOUTS.find((item) => item.value === layout)?.label;

  const onClick = () => {
    activeEditor.dispatchCommand(INSERT_LAYOUT_COMMAND, layout);
    onClose();
  };

  return (
    <>
      <DropDown
        buttonClassName={`${theme.toolbar.toolbarItem.base} block-controls`}
        buttonLabel={buttonLabel}>
        {LAYOUTS.map(({label, value}) => (
          <DropDownItem
            key={value}
            className={`${theme.dropdown.item.base} item`}
            onClick={() => setLayout(value)}>
            <span className={`${theme.dropdown.item.text}`}>{label}</span>
          </DropDownItem>
        ))}
      </DropDown>
      <Button onClick={onClick}>Insert</Button>
    </>
  );
}