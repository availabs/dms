/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';

import {type LexicalEditor} from 'lexical';
import * as React from 'react';
import {useState} from 'react';

import DropDown, {DropDownItem} from '../../ui/DropDown';
import {INSERT_LAYOUT_COMMAND} from './LayoutPlugin';
import { useLexicalTheme } from '../../../useLexicalTheme';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import { ThemeContext } from '../../../../../useTheme';

// Codebase-default column-layout templates. Themes can replace this set
// by declaring `theme.lexical.layoutTemplates` — the editor entry mirrors
// the theme's value onto `editor._config.theme.layoutTemplates` and this
// dialog reads from there (with this hardcoded list as the fallback when
// the theme doesn't declare its own).
export const LAYOUTS = [
  {label: '2 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2', count: 2},
  {label: '2 columns (25% - 75%)', value: 'grid-cols-1 md:grid-cols-[1fr_3fr]', count:2},
  {label: '3 columns (equal width)', value: 'grid-cols-1 md:grid-cols-3', count: 3},
  {label: '3 columns (25% - 50% - 25%)', value: 'grid-cols-1 md:grid-cols-[1fr_2fr_1fr]', count: 3},
  {label: '4 columns (equal width)', value: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4', count: 4},
  {label: '5 columns (equal width)', value: 'grid-cols-1 md:grid-cols-5 lg:grid-cols-5', count: 5},
];

export default function InsertLayoutDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const theme = useLexicalTheme();
  // Theme can override the hardcoded codebase template list via
  // `theme.lexical.layoutTemplates` — mirrored onto _config.theme by
  // editor/index.tsx. Falls back to the hardcoded LAYOUTS export when
  // the active theme hasn't declared its own.
  const [editor] = useLexicalComposerContext();
  const templates = ((editor?._config?.theme as { layoutTemplates?: typeof LAYOUTS })?.layoutTemplates) || LAYOUTS;
  const [layout, setLayout] = useState(templates[0].value);
  const buttonLabel = templates.find((item) => item.value === layout)?.label;

  const onClick = () => {
    activeEditor.dispatchCommand(INSERT_LAYOUT_COMMAND, layout);
    onClose();
  };

  // Brand UI from ThemeContext. Select (a singleSelectOnly wrapper around
  // MultiSelect) replaces the lexical-internal DropDown so the field renders
  // in the brand's form skin.
  const { UI } = React.useContext(ThemeContext) || {};
  const Button = UI?.Button;
  const Select = UI?.Select;
  const DialogActions = UI?.DialogActions
    || (({children}: {children: React.ReactNode}) => <div className="flex justify-end gap-2 mt-4">{children}</div>);
  const options = React.useMemo(
    () => templates.map(({label, value}) => ({label, value})),
    [templates],
  );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Columns</span>
        {Select ? (
          <Select
            options={options}
            value={layout}
            onChange={(next: string) => { if (next) setLayout(next); }}
          />
        ) : (
          <DropDown
            buttonClassName={`${theme.toolbar_toolbarItem_base} block-controls`}
            buttonLabel={buttonLabel}>
            {templates.map(({label, value}) => (
              <DropDownItem
                key={value}
                className={`${theme.dropdown_item_base} item`}
                onClick={() => setLayout(value)}>
                <span className={`${theme.dropdown_item_text}`}>{label}</span>
              </DropDownItem>
            ))}
          </DropDown>
        )}
      </label>

      <DialogActions>
        {Button ? (
          <Button onClick={onClick}>Insert</Button>
        ) : (
          <button onClick={onClick} className="px-3 py-1.5 bg-slate-800 text-white">
            Insert
          </button>
        )}
      </DialogActions>
    </div>
  );
}