/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import React from 'react'
import type {JSX} from 'react';

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  INSERT_TABLE_COMMAND,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import type {EditorThemeClasses, Klass, LexicalEditor, LexicalNode} from 'lexical';
import {createContext, useContext, useEffect, useMemo, useState} from 'react';
import invariant from '../utils/invariant';

import { ThemeContext } from '../../../../useTheme';

export type InsertTableCommandPayload = Readonly<{
  columns: string;
  rows: string;
  includeHeaders?: boolean;
}>;

export type CellContextShape = {
  cellEditorConfig: null | CellEditorConfig;
  cellEditorPlugins: null | JSX.Element | Array<JSX.Element>;
  set: (
    cellEditorConfig: null | CellEditorConfig,
    cellEditorPlugins: null | JSX.Element | Array<JSX.Element>,
  ) => void;
};

export type CellEditorConfig = Readonly<{
  namespace: string;
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
  onError: (error: Error, editor: LexicalEditor) => void;
  readOnly?: boolean;
  theme?: EditorThemeClasses;
}>;

export const CellContext = createContext<CellContextShape>({
  cellEditorConfig: null,
  cellEditorPlugins: null,
  set: () => {
    // Empty
  },
});

export function TableContext({children}: {children: JSX.Element}) {
  const [contextValue, setContextValue] = useState<{
    cellEditorConfig: null | CellEditorConfig;
    cellEditorPlugins: null | JSX.Element | Array<JSX.Element>;
  }>({
    cellEditorConfig: null,
    cellEditorPlugins: null,
  });
  return (
    <CellContext.Provider
      value={useMemo(
        () => ({
          cellEditorConfig: contextValue.cellEditorConfig,
          cellEditorPlugins: contextValue.cellEditorPlugins,
          set: (cellEditorConfig, cellEditorPlugins) => {
            setContextValue({cellEditorConfig, cellEditorPlugins});
          },
        }),
        [contextValue.cellEditorConfig, contextValue.cellEditorPlugins],
      )}>
      {children}
    </CellContext.Provider>
  );
}

export function InsertTableDialog({
  activeEditor,
  onClose,
}: {
  activeEditor: LexicalEditor;
  onClose: () => void;
}): JSX.Element {
  const { UI } = React.useContext(ThemeContext) || {};
  const Input = UI?.Input;
  const Button = UI?.Button;
  const DialogActions = UI?.DialogActions
    || (({children}: {children: React.ReactNode}) => <div className="flex justify-end gap-2 mt-4">{children}</div>);

  const [rows, setRows] = useState('5');
  const [columns, setColumns] = useState('5');
  const [isDisabled, setIsDisabled] = useState(true);

  useEffect(() => {
    const row = Number(rows);
    const column = Number(columns);
    if (row && row > 0 && row <= 500 && column && column > 0 && column <= 50) {
      setIsDisabled(false);
    } else {
      setIsDisabled(true);
    }
  }, [rows, columns]);

  const onClick = () => {
    activeEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns,
      rows,
    });

    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Rows</span>
        {Input ? (
          <Input
            type="number"
            value={rows}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRows(e.target.value)}
            placeholder="# of rows (1-500)"
            data-test-id="table-modal-rows"
          />
        ) : (
          <input
            type="number"
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            placeholder="# of rows (1-500)"
            className="border px-2 py-1"
            data-test-id="table-modal-rows"
          />
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Columns</span>
        {Input ? (
          <Input
            type="number"
            value={columns}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColumns(e.target.value)}
            placeholder="# of columns (1-50)"
            data-test-id="table-modal-columns"
          />
        ) : (
          <input
            type="number"
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
            placeholder="# of columns (1-50)"
            className="border px-2 py-1"
            data-test-id="table-modal-columns"
          />
        )}
      </label>

      <DialogActions data-test-id="table-model-confirm-insert">
        {Button ? (
          <Button disabled={isDisabled} onClick={onClick}>
            Confirm
          </Button>
        ) : (
          <button
            disabled={isDisabled}
            onClick={onClick}
            className="px-3 py-1.5 bg-slate-800 text-white">
            Confirm
          </button>
        )}
      </DialogActions>
    </div>
  );
}

export function TablePlugin({
  cellEditorConfig,
  children,
}: {
  cellEditorConfig: CellEditorConfig;
  children: JSX.Element | Array<JSX.Element>;
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const cellContext = useContext(CellContext);
  useEffect(() => {
    if (!editor.hasNodes([TableNode, TableRowNode, TableCellNode])) {
      invariant(
        false,
        'TablePlugin: TableNode, TableRowNode, or TableCellNode is not registered on editor',
      );
    }
  }, [editor]);
  useEffect(() => {
    cellContext.set(cellEditorConfig, children);
  }, [cellContext, cellEditorConfig, children]);
  return null;
}