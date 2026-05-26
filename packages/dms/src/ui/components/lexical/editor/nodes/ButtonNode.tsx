/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
  SerializedDecoratorNode,
} from 'lexical';
import {useLexicalEditable} from '@lexical/react/useLexicalEditable';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {DecoratorNode} from 'lexical';

import * as React from 'react';
import {useLocation, useNavigate} from 'react-router'
import {InsertButtonDialog} from "../plugins/ButtonPlugin";
import useModal from "../hooks/useModal";
import { ThemeContext, getComponentTheme } from "../../../../useTheme";

/**
 * Resolve which `button.styles[]` variant a button node should render with.
 *
 * Picks the active theme's matching style by name. Falls back to the
 * theme's first style (styles[0].name) when the node carries a legacy
 * style name from the pre-theme-integration era (e.g. 'primary',
 * 'secondary', 'primarySmall', 'whiteSmall'). Logs once per unknown
 * legacy name so the migration path is discoverable in devtools.
 */
const _warnedLegacyStyles = typeof Set !== 'undefined' ? new Set<string>() : null;
function resolveButtonStyleName(
  themeButton: { styles?: Array<{ name?: string }> } | undefined,
  storedStyle: string | undefined,
): string {
  const styles = themeButton?.styles || [];
  if (!styles.length) return storedStyle || 'default';
  const matches = styles.some(s => s?.name === storedStyle);
  if (matches) return storedStyle as string;
  const fallback = styles[0]?.name || 'default';
  if (storedStyle && _warnedLegacyStyles && !_warnedLegacyStyles.has(storedStyle)) {
    _warnedLegacyStyles.add(storedStyle);
    // eslint-disable-next-line no-console
    console.warn(
      `[Lexical Button] Stored style "${storedStyle}" is not a name in ` +
      `theme.button.styles[]. Rendering with "${fallback}" instead. ` +
      `Migrate legacy button data to a current style name to silence this warning.`
    );
  }
  return fallback;
}

function ButtonComponent({nodeKey, linkText, path, keepSearchParams, style}) {
  const isEditable = useLexicalEditable();
  const [editor] = useLexicalComposerContext();
  const [modal, showModal] = useModal();
  const location = useLocation();
  const navigate = useNavigate();
  const linkPath = keepSearchParams ? `${path}${location.search}` : path;

  const { theme: fullTheme = {}, UI } = React.useContext(ThemeContext) || {};
  const Button = UI?.Button;

  // Pick the active style — falls back gracefully for legacy stored names.
  const activeStyle = resolveButtonStyleName(
    fullTheme?.button as { styles?: Array<{ name?: string }> } | undefined,
    style,
  );

  // Click target depends on mode:
  //   - editable → opens the InsertButtonDialog with the current node's values
  //   - view     → navigates: useNavigate for internal paths, window.open
  //                for external (http(s):// or //) so React Router doesn't
  //                try to route external URLs.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isEditable) {
      showModal('Insert Button', (onClose) => (
        <InsertButtonDialog
          activeEditor={editor}
          onClose={onClose}
          initialValues={{linkText, keepSearchParams, path, style, nodeKey}}
        />
      ));
      return;
    }
    if (!linkPath) return;
    if (/^(https?:)?\/\//.test(linkPath)) {
      window.open(linkPath, '_blank', 'noopener,noreferrer');
    } else {
      navigate(linkPath);
    }
  };

  // Belt-and-braces: if UI.Button isn't available (e.g. node rendered
  // outside a ThemeContext provider) fall back to a span with the theme's
  // button class string. Same brand skin, different element.
  if (!Button) {
    const t = getComponentTheme(fullTheme, 'button', activeStyle);
    return (
      <>
        <span className={t?.button || ''} onClick={handleClick}>
          {linkText || 'submit'}
        </span>
        {modal}
      </>
    );
  }

  return (
    <>
      <Button activeStyle={activeStyle} onClick={handleClick}>
        {linkText || 'submit'}
      </Button>
      {modal}
    </>
  );
}
export interface ButtonPayload {
    linkText: string;
    keepSearchParams: boolean;
    path: string;
    style?: string;
}

export type SerializedButtonNode = Spread<
  {
    linkText: string;
    keepSearchParams: boolean;
    path: string;
    style: string;
  },
  SerializedDecoratorNode
>;

function convertButtonElement(
  domNode: HTMLElement,
): null | DOMConversionOutput {
  const linkText = domNode.innerText
  const path = domNode.getAttribute('href') //getAttribute('data-lexical-button');
  const style = domNode.getAttribute('data-lexical-button-style') || undefined;
  if (linkText) {
    const node = $createButtonNode({linkText, path, style});
    return {node};
  }
  return null;
}

export class ButtonNode extends DecoratorNode {
  __linkText: string;
  __keepSearchParams: boolean;
  __path: string;
  __style: string;

  static getType(): string {
    return 'button';
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(node.__linkText, node.__keepSearchParams, node.__path, node.__style, node.__key);
  }

  static importJSON(serializedNode): ButtonNode {
    const node = $createButtonNode({linkText: serializedNode.linkText, keepSearchParams: serializedNode.keepSearchParams, path:serializedNode.path, style:serializedNode.style});

    return node;
  }

  exportJSON(): SerializedButtonNode {
    return {
      ...super.exportJSON(),
      type: 'button',
      version: 1,
      linkText: this.__linkText,
      keepSearchParams: this.__keepSearchParams,
      path: this.__path,
      style: this.__style
    };
  }

  constructor(linkText: string, keepSearchParams: boolean, path?: string, style?: string, key?: NodeKey) {
    super(key);
    this.__linkText = linkText;
    this.__keepSearchParams = keepSearchParams;
    this.__path = path;
    this.__style = style;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('span'); // or 'a', but span is safest for inline
    element.setAttribute('data-lexical-button', 'true');
    return element;
  }

  exportDOM(): DOMExportOutput {
    // HTML/PDF export: emit a clean <a> with the link text and a
    // data-lexical-button-style attribute so the round-trip
    // ($importDOM → $convertButtonElement) preserves the style choice.
    // Classes are intentionally NOT inlined — the live React render
    // (decorate()) owns styling via the brand theme; exporters or
    // downstream consumers can apply their own styling at conversion
    // time if they need it.
    const element = document.createElement('a');
    element.setAttribute('href', this.__path);
    element.setAttribute('data-lexical-button', 'true');
    if (this.__style) element.setAttribute('data-lexical-button-style', this.__style);
    element.textContent = this.__linkText;
    return {element};
  }

  static importDOM(): DOMConversionMap | null {
    return {
      a: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-button')) {
          return null;
        }
        return {
          conversion: convertButtonElement,
          priority: 2,
        };
      },
    };
  }

  updateDOM(): false {
    return false;
  }

  getId(): string {
    return this.__id;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <ButtonComponent
        format={this.__format}
        nodeKey={this.getKey()}
        linkText={this.__linkText}
        keepSearchParams={this.__keepSearchParams}
        path={this.__path}
        style={this.__style}
      />
    );
  }

  isInline(): true {
    return true;
  }
}

export function $createButtonNode(payload): ButtonNode {
  const {linkText, keepSearchParams, path, style} = payload
  return new ButtonNode(linkText, keepSearchParams, path, style);
}

export function $isButtonNode(
  node: ButtonNode | LexicalNode | null | undefined,
): node is ButtonNode {
  return node instanceof ButtonNode;
}
