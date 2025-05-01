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
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from 'lexical';
import {useLexicalEditable} from '@lexical/react/useLexicalEditable';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  DecoratorNode,
  SerializedDecoratorNode,
} from 'lexical';

import * as React from 'react';
import {Link} from 'react-router'
import {InsertButtonDialog} from "../plugins/ButtonPlugin";
import useModal from "../hooks/useModal";

const BUTTON_STYLES = {
  primary: 'w-fit h-fit cursor-pointer uppercase bg-[#EAAD43] hover:bg-[#F1CA87] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]',
  secondary: 'w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]',
  primarySmall: 'w-fit h-fit cursor-pointer uppercase bg-[#EAAD43] hover:bg-[#F1CA87] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center pt-[9px] pb-[7px] px-[12px]',
  secondarySmall: 'w-fit h-fit cursor-pointer uppercase border bg-[#E0EBF0] hover:bg-[#C5D7E0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center pt-[9px] pb-[7px] px-[12px]',  
  whiteSmall: 'w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center pt-[9px] pb-[7px] px-[12px]',  
}

function ButtonComponent({nodeKey, linkText, path, style}) {
  const isEditable = useLexicalEditable();
  const [editor] = useLexicalComposerContext();
  const [modal, showModal] = useModal();
  // type ShowModal = ReturnType<typeof useModal>[1];

  return (
      <>
        {isEditable ? (
            <span
                className={`${BUTTON_STYLES[style] || BUTTON_STYLES['primary']}`}
                onClick={(e) => {
                  e.preventDefault();
                  showModal('Insert Button', (onClose) => (
                      <InsertButtonDialog activeEditor={editor} onClose={onClose} initialValues={{linkText, path, style, nodeKey}}/>
                  ))
                }}
            >
              {linkText || 'submit'}
            </span>
        ) : (
            <Link
                className={`${BUTTON_STYLES[style] || BUTTON_STYLES['primary']}`}
                to={path}
            >
              {linkText || 'submit'}
            </Link>
        )}

        {modal}
      </>
  );
}
export interface ButtonPayload {
    linkText: string;
    path: string;
    style?: string;
}

export type SerializedButtonNode = Spread<
  {
    linkText: string;
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
  const style = domNode.style
  //console.log("converyButton element", linkText, path, style, domNode)
  if (linkText) {
    const node = $createButtonNode({linkText, path, style});
    return {node};
  }
  return null;
}

export class ButtonNode extends DecoratorNode {
  __linkText: string;
  __path: string;
  __style: string;

  static getType(): string {
    return 'button';
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(node.__linkText, node.__path, node.__style, node.__key);
  }

  static importJSON(serializedNode): ButtonNode {
    const node = $createButtonNode({linkText: serializedNode.linkText, path:serializedNode.path, style:serializedNode.style});

    return node;
  }

  exportJSON(): SerializedButtonNode {
    return {
      ...super.exportJSON(),
      type: 'button',
      version: 1,
      linkText: this.__linkText,
      path: this.__path,
      style: this.__style
    };
  }

  constructor(linkText: string, path?: string, style?: string, key?: NodeKey) {
    super(key);
    this.__linkText = linkText;
    this.__path = path;
    this.__style = style;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('span'); // or 'a', but span is safest for inline
    element.setAttribute('data-lexical-button', 'true');
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('a');
    element.setAttribute('href', this.__path);
    element.setAttribute('data-lexical-button', 'true');
    element.className = this.__style;
    element.innerText = this.__linkText;
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
  const {linkText,path,style} = payload
  return new ButtonNode(linkText,path,style);
}

export function $isButtonNode(
  node: ButtonNode | LexicalNode | null | undefined,
): node is ButtonNode {
  return node instanceof ButtonNode;
}
