// /**
//  * Copyright (c) Meta Platforms, Inc. and affiliates.
//  *
//  * This source code is licensed under the MIT license found in the
//  * LICENSE file in the root directory of this source tree.
//  *
//  */
import {
  $insertNodes,
    $getNodeByKey,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {mergeRegister} from '@lexical/utils';
import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {ThemeContext} from "../../../../../useTheme";
import {
  $createButtonNode,
  $isButtonNode,
  ButtonNode,
  type ButtonPayload,
} from '../../nodes/ButtonNode';


export const INSERT_BUTTON_COMMAND: LexicalCommand<ButtonPayload> =
  createCommand('INSERT_BUTTON_COMMAND');

export function InsertButtonDialog({
                                     activeEditor,
                                     onClose,
                                     initialValues,
                                   }: {
  activeEditor: LexicalEditor;
  onClose: () => void;
  initialValues?: {
    linkText: string;
    keepSearchParams: boolean;
    path: string;
    style: string;
    nodeKey?: string;
  };
}): JSX.Element {
  // Pull UI + theme from the host ThemeContext so the dialog renders in
  // brand primitives (UI.Input / UI.MultiSelect / UI.Switch / UI.Button)
  // and the button-style dropdown is populated from the active theme's
  // button.styles[] — not from a hardcoded list.
  const { theme: fullTheme = {}, UI } = React.useContext(ThemeContext) || {};
  const Input = UI?.Input;
  const Button = UI?.Button;
  const Select = UI?.Select;
  const Switch = UI?.Switch;
  const DialogActions = UI?.DialogActions
    || (({children}: {children: React.ReactNode}) => <div className="flex justify-end gap-2 mt-4">{children}</div>);

  // Auto-generate style options from theme.button.styles[].name. Every
  // theme gets the right list for free: tessera → default / plain / active
  // / danger; catalyst → its own set; etc.
  const styleOptions = React.useMemo(() => {
    const styles = (fullTheme?.button as { styles?: Array<{ name?: string }> } | undefined)?.styles || [];
    return styles
      .map(s => s?.name)
      .filter((n): n is string => !!n)
      .map(name => ({ label: name, value: name }));
  }, [fullTheme]);

  const defaultStyle = styleOptions[0]?.value || 'default';

  const hasModifier = useRef(false);
  const [linkText, setLinkText] = useState(initialValues?.linkText || 'submit');
  const [keepSearchParams, setKeepSearchParams] = useState(initialValues?.keepSearchParams || false);
  const [path, setPath] = useState(initialValues?.path || '#');
  const [style, setStyle] = useState(initialValues?.style || defaultStyle);

  useEffect(() => {
    hasModifier.current = false;
    const handler = (e: KeyboardEvent) => {
      hasModifier.current = e.altKey;
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [activeEditor]);

  const handleOnClick = () => {
    const payload = {linkText, keepSearchParams, path, style};
    activeEditor.update(() => {
      if (initialValues?.nodeKey) {
        const newNode = $createButtonNode({linkText, keepSearchParams, path, style});
        const oldNode = $getNodeByKey(initialValues.nodeKey);
        if ($isButtonNode(oldNode)) {
          oldNode.replace(newNode);
        }
      } else {
        activeEditor.dispatchCommand(INSERT_BUTTON_COMMAND, payload);
      }
    });
    onClose();
  };

  const isDisabled = React.useMemo(() => linkText?.length === 0 || path?.length === 0, [linkText,path])

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Button Text</span>
        {Input ? (
          <Input
            value={linkText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkText(e.target.value)}
            placeholder=""
            data-test-id="image-modal-alt-text-input"
          />
        ) : (
          <input
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            className="border px-2 py-1"
          />
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">URL</span>
        {Input ? (
          <Input
            value={path}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value)}
            placeholder="LinkPath"
          />
        ) : (
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="border px-2 py-1"
          />
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Style</span>
        {Select ? (
          <Select
            options={styleOptions}
            value={style}
            onChange={(next: string) => { if (next) setStyle(next); }}
          />
        ) : (
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="border px-2 py-1">
            {styleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        {Switch ? (
          <Switch
            checked={keepSearchParams}
            onChange={(checked: boolean) => setKeepSearchParams(checked)}
          />
        ) : (
          <input
            type="checkbox"
            checked={keepSearchParams}
            onChange={(e) => setKeepSearchParams(e.target.checked)}
          />
        )}
        <span className="text-sm">Keep search params</span>
      </label>

      <DialogActions>
        {Button ? (
          <Button
            data-test-id="create-button-node"
            disabled={isDisabled}
            onClick={handleOnClick}
          >
            Confirm
          </Button>
        ) : (
          <button
            disabled={isDisabled}
            onClick={handleOnClick}
            className="px-3 py-1.5 bg-slate-800 text-white"
          >
            Confirm
          </button>
        )}
      </DialogActions>
    </div>
  );
}

export default function ButtonPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ButtonNode])) {
      throw new Error('ButtonPlugin: ButtonNode not registered on editor');
    }

    return mergeRegister(
      editor.registerCommand<ButtonPayload>(
        INSERT_BUTTON_COMMAND,
        (payload) => {
          const buttonNode = $createButtonNode(payload);
          $insertNodes([buttonNode]);
          // $wrapNodeInElement(buttonNode, $createParagraphNode).selectEnd();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      )
    );
  }, [editor]);

  return null;
}
