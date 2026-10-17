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
// the UI primitives this dialog renders when the host ThemeContext has no `UI` (2026-10-17: they don't import
// the editor, so there is no import cycle — this replaced raw-HTML fallbacks)
import DefaultInput from '../../../../Input';
import DefaultButton from '../../../../Button';
import DefaultSwitch from '../../../../Switch';
import DefaultSelect from '../../../../Select';
import DefaultDialogActions from '../../../../DialogActions';
import DefaultFieldLabel from '../../../../FieldLabel';
import {
  $createButtonNode,
  $isButtonNode,
  ButtonNode,
  type ButtonPayload,
} from '../../nodes/ButtonNode';


// What a button did before "Is External" existed: a full http(s):// or // URL
// opened in a new tab; site paths and `sub://` platform links stayed in the tab.
// Pre-selects the toggle for legacy buttons so re-saving one doesn't change it.
const defaultIsExternal = (path?: string): boolean =>
  typeof path === 'string' && /^(https?:)?\/\//.test(path);

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
    actionType?: 'navigate' | 'setParam';
    paramKey?: string;
    paramValue?: string;
    icon?: string;
    isExternal?: boolean;
    nodeKey?: string;
  };
}): JSX.Element {
  // Pull UI + theme from the host ThemeContext so the dialog renders in
  // brand primitives (UI.Input / UI.MultiSelect / UI.Switch / UI.Button)
  // and the button-style dropdown is populated from the active theme's
  // button.styles[] — not from a hardcoded list.
  const { theme: fullTheme = {}, UI } = React.useContext(ThemeContext) || {};
  const Input = UI?.Input || DefaultInput;
  const Button = UI?.Button || DefaultButton;
  const Select = UI?.Select || DefaultSelect;
  const Switch = UI?.Switch || DefaultSwitch;
  const FieldLabel = UI?.FieldLabel || DefaultFieldLabel;
  const DialogActions = UI?.DialogActions || DefaultDialogActions;

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

  const actionTypeOptions = [
    { label: 'Navigate', value: 'navigate' },
    { label: 'Set Page Param', value: 'setParam' },
  ];

  const hasModifier = useRef(false);
  const [linkText, setLinkText] = useState(initialValues?.linkText || 'submit');
  const [keepSearchParams, setKeepSearchParams] = useState(initialValues?.keepSearchParams || false);
  const [path, setPath] = useState(initialValues?.path || '#');
  const [style, setStyle] = useState(initialValues?.style || defaultStyle);
  const [actionType, setActionType] = useState(initialValues?.actionType || 'navigate');
  const [paramKey, setParamKey] = useState(initialValues?.paramKey || '');
  const [paramValue, setParamValue] = useState(initialValues?.paramValue || '');
  const [icon, setIcon] = useState(initialValues?.icon || '');
  const [isExternal, setIsExternal] = useState(
    initialValues?.isExternal ?? defaultIsExternal(initialValues?.path),
  );

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
    const payload = {linkText, keepSearchParams, path, style, actionType, paramKey, paramValue, icon, isExternal};
    activeEditor.update(() => {
      if (initialValues?.nodeKey) {
        const newNode = $createButtonNode(payload);
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

  const isDisabled = React.useMemo(() => {
    if (linkText?.length === 0) return true;
    return actionType === 'setParam'
      ? paramKey?.length === 0 || paramValue?.length === 0
      : path?.length === 0;
  }, [linkText, path, actionType, paramKey, paramValue])

  return (
    <div className="flex flex-col gap-4">
      <FieldLabel text="Button Text">
        <Input
          value={linkText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkText(e.target.value)}
          placeholder=""
          data-test-id="image-modal-alt-text-input"
        />
      </FieldLabel>

      <FieldLabel text="Click Action">
        <Select
          options={actionTypeOptions}
          value={actionType}
          onChange={(next: string) => { if (next) setActionType(next); }}
        />
      </FieldLabel>

      {actionType === 'navigate' ? (
        <FieldLabel text="URL">
          <Input
            value={path}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value)}
            placeholder="LinkPath"
          />
        </FieldLabel>
      ) : (
        <>
          <FieldLabel text="Param Key">
            <Input
              value={paramKey}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParamKey(e.target.value)}
              placeholder="paramKey"
            />
          </FieldLabel>

          <FieldLabel text="Param Value">
            <Input
              value={paramValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParamValue(e.target.value)}
              placeholder="paramValue"
            />
          </FieldLabel>
        </>
      )}

      <FieldLabel text="Style">
        <Select
          options={styleOptions}
          value={style}
          onChange={(next: string) => { if (next) setStyle(next); }}
        />
      </FieldLabel>

      <FieldLabel text="Icon (registered icon name, optional)">
        <Input
          value={icon}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIcon(e.target.value)}
          placeholder="e.g. Download"
        />
      </FieldLabel>

      {actionType === 'navigate' && (
        <div className="flex items-center gap-2">
          <Switch
            enabled={keepSearchParams}
            setEnabled={(checked: boolean) => setKeepSearchParams(checked)}
          />
          <span className="text-sm">Keep search params</span>
        </div>
      )}

      {actionType === 'navigate' && (
        <div className="flex items-center gap-2">
          <Switch
            enabled={isExternal}
            setEnabled={(checked: boolean) => setIsExternal(checked)}
          />
          <span className="text-sm">Is External (open in new tab)</span>
        </div>
      )}

      <DialogActions>
        <Button
          data-test-id="create-button-node"
          disabled={isDisabled}
          onClick={handleOnClick}
        >
          Confirm
        </Button>
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
