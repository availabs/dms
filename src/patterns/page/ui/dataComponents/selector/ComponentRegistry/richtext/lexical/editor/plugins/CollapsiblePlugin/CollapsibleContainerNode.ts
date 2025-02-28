/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical';

type SerializedCollapsibleContainerNode = Spread<
  {
    open: boolean;
  },
  SerializedElementNode
>;

export function convertDetailsElement(
  domNode: HTMLDetailsElement,
): DOMConversionOutput | null {
  const isOpen = domNode.open !== undefined ? domNode.open : true;
  const node = $createCollapsibleContainerNode(isOpen);
  return {
    node,
  };
}

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  constructor(open: boolean, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  static getType(): string {
    return 'collapsible-container';
  }

  static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const minimisedHeight = '300px';
    const dom = document.createElement('div');
    dom.classList.add('Collapsible__container');
    dom.classList.add('flex', 'flex-col', 'gap-4', 'bg-[#F3F8F9]', 'p-[12px]', 'pt-[16px]', 'rounded-lg', 'mb-2');
    dom.open = this.__open;
    // Set default state (open or partially collapsed)
    dom.style.maxHeight = this.__open ? 'none' : minimisedHeight;

    // Listen for toggle event
    dom.addEventListener('toggle', () => {
      editor.update(() => {
        const open = this.getOpen();

        // Control height instead of relying on "open" attribute
        dom.style.maxHeight = open ? 'none' : minimisedHeight;
        dom.style.overflow = open ? 'visible' : 'hidden';
      });
    });

    return dom;
  }

  updateDOM(
    prevNode: CollapsibleContainerNode,
    dom: HTMLDetailsElement,
  ): boolean {
    if (prevNode.__open !== this.__open) {
      dom.open = true //this.__open;
      dom.style.maxHeight = this.__open ? 'none' : '195px';
      this.getChildren().forEach((child) => child.markDirty());
    }

    return false;
  }

  static importDOM(): DOMConversionMap<HTMLDetailsElement> | null {
    return {
      details: (domNode: HTMLDetailsElement) => {
        return {
          conversion: convertDetailsElement,
          priority: 1,
        };
      },
    };
  }

  static importJSON(
    serializedNode: SerializedCollapsibleContainerNode,
  ): CollapsibleContainerNode {
    const node = $createCollapsibleContainerNode(serializedNode.open);
    return node;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('details');
    element.setAttribute('open', this.__open.toString());
    return {element};
  }

  exportJSON(): SerializedCollapsibleContainerNode {
    return {
      ...super.exportJSON(),
      open: this.__open,
      type: 'collapsible-container',
      version: 1,
    };
  }

  setOpen(open: boolean): void {
    const writable = this.getWritable();
    writable.__open = open;

    // // Find the corresponding DOM element and update max-height
    // const dom = editor.getElementByKey(this.getKey());
    // if (dom) {
    //   if (open) {
    //     dom.style.maxHeight = '500px'; // Adjust based on content size
    //   } else {
    //     dom.style.maxHeight = '50px'; // Minimum height when "collapsed"
    //   }
    // }
  }


  getOpen(): boolean {
    return this.__open;
  }

  toggleOpen(): void {
    this.setOpen(!this.getOpen());
  }

  toggleCollapsed() {
    this.getWritable().__collapsed = !this.__collapsed;
  }

}

export function $createCollapsibleContainerNode(
  isOpen: boolean,
): CollapsibleContainerNode {
  return new CollapsibleContainerNode(isOpen);
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode;
}
