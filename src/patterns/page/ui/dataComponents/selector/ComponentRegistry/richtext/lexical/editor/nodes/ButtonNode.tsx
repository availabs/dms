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

import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from '@lexical/react/LexicalDecoratorBlockNode';

import * as React from 'react';
import {Link} from 'react-router-dom'

const BUTTON_STYLES = {
  primary: 'w-fit h-fit cursor-pointer uppercase bg-[#EAAD43] hover:bg-[#F1CA87] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]',
  secondary: 'w-fit h-fit cursor-pointer uppercase border boder-[#E0EBF0] bg-white hover:bg-[#E0EBF0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center py-[16px] px-[24px]',
  primarySmall: 'w-fit h-fit cursor-pointer uppercase bg-[#EAAD43] hover:bg-[#F1CA87] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center pt-[9px] pb-[7px] px-[12px]',
  secondarySmall: 'w-fit h-fit cursor-pointer uppercase border bg-[#E0EBF0] hover:bg-[#C5D7E0] text-[#37576B] font-[700] leading-[14.62px] rounded-full text-[12px] text-center pt-[9px] pb-[7px] px-[12px]',  
} 

function ButtonComponent({
  format,
  nodeKey,
  linkText,
  path,
  style
}) {
  /*console.log('ButtonComponent classname', className)
  console.log('ButtonComponent format',format, )
  console.log('ButtonComponent nodekey', nodeKey)
  console.log('ButtonComponent linkText',linkText)*/

  return (
    <Link className={BUTTON_STYLES[style] || BUTTON_STYLES['primary']} to={path}>
      {typeof linkText === 'string' ? linkText : 'submit'}
    </Link>
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
  SerializedDecoratorBlockNode
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

export class ButtonNode extends DecoratorBlockNode {
  __linkText: string;
  __path: string;
  __style: string;

  static getType(): string {
    return 'button';
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(node.__linkText, node.__path, node.__style, node.__format, node.__key);
  }

  static importJSON(serializedNode): ButtonNode {
    const node = $createButtonNode({linkText: serializedNode.linkText, path:serializedNode.path, style:serializedNode.style});
    node.setFormat(serializedNode.format);
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

  constructor(linkText: string, path?: string, style?: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key);
    this.__linkText = linkText;
    this.__path = path;
    this.__style = style;
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
      div: (domNode: HTMLElement) => {
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

  isInline(): false {
    return false;
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
