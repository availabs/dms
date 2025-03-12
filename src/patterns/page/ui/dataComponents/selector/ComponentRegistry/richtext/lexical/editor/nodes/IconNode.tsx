/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
} from 'lexical';

import {$applyNodeReplacement, TextNode} from 'lexical';

export type SerializedIconNode = Spread<
  {
    className: string;
  },
  SerializedTextNode
>;

export class IconNode extends TextNode {
  __className: string;

  static getType(): string {
    return 'emoji';
  }

  static clone(node: IconNode): IconNode {
    return new IconNode(node.__className, node.__text, node.__key);
  }

  constructor(className: string, text: string, key?: NodeKey) {
    super(text, key);
    this.__className = className;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('span');
    const inner = super.createDOM(config);
    dom.className = this.__className;
    inner.className = 'emoji-inner';
    dom.appendChild(inner);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const inner = dom.firstChild;
    if (inner === null) {
      return true;
    }
    super.updateDOM(prevNode, inner as HTMLElement, config);
    return false;
  }

  static importJSON(serializedNode: SerializedIconNode): IconNode {
    return $createIconNode(
      serializedNode.className,
      serializedNode.text,
    ).updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedIconNode {
    return {
      ...super.exportJSON(),
      className: this.getClassName(),
    };
  }

  getClassName(): string {
    const self = this.getLatest();
    return self.__className;
  }
}

export function $isIconNode(
  node: LexicalNode | null | undefined,
): node is IconNode {
  return node instanceof IconNode;
}

export function $createIconNode(
  className: string,
  emojiText: string,
): IconNode {
  const node = new IconNode(className, emojiText).setMode('token');
  return $applyNodeReplacement(node);
}