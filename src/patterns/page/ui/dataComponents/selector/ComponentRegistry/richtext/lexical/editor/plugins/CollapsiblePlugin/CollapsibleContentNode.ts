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
  LexicalNode,
  SerializedElementNode,
} from 'lexical';
import { $isCollapsibleContainerNode } from './CollapsibleContainerNode';

type SerializedCollapsibleContentNode = SerializedElementNode;

export function convertCollapsibleContentElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const node = $createCollapsibleContentNode();
  return {
    node,
  };
}

export class CollapsibleContentNode extends ElementNode {
  static getType(): string {
    return 'collapsible-content';
  }

  static clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }
  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = document.createElement('div');
    dom.classList.add(
        'Collapsible__content',
        'text-[14px]', 'leading-[19.6px]',
        'overflow-hidden', 'transition-all', 'duration-300', 'ease-in-out'
    );

    const parent = this.getParent();

    if ($isCollapsibleContainerNode(parent)) {
      requestAnimationFrame(() => {
        this.applyStyles(dom, parent.getOpen());
      });
    }
    return dom;
  }

  updateDOM(prevNode: CollapsibleContentNode, dom: HTMLElement): boolean {
    const parent = this.getParent();

    if ($isCollapsibleContainerNode(parent)) {
      requestAnimationFrame(() => {
        this.applyStyles(dom, parent.getOpen());
      });

      this.markDirty(); // Ensure Lexical recognizes updates
    }

    return false;
  }

  applyStyles(dom: HTMLElement, isOpen: boolean) {
    dom.style.maxHeight = isOpen ? 'none' : '64px';
    dom.style.overflow = isOpen ? 'auto' : 'hidden';

    if (isOpen) {
      dom.classList.remove(
          'bg-gradient-to-b', 'from-[#2D3E4C]', 'to-[#F3F8F9]',
          'bg-clip-text', 'text-transparent'
      );
      dom.classList.add('text-[#37576B]'); // Solid color when open

      // Reset styles
      dom.style.background = '';
      dom.style.webkitMaskImage = '';  // Remove mask when open
      dom.style.maskImage = '';
    } else {
      dom.classList.remove('text-[#37576B]');
      dom.classList.add('text-[#2D3E4C]'); // Ensure text is visible

      // Use mask-image to create the fade effect at the bottom
      dom.style.background = '';
      dom.style.webkitMaskImage = 'linear-gradient(to bottom, rgba(0,0,0,1), rgba(0,0,0,0.2))';
      dom.style.maskImage = 'linear-gradient(to bottom, rgba(0,0,0,1), rgba(0,0,0,0.2))';
    }
  }


  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-collapsible-content')) {
          return null;
        }
        return {
          conversion: convertCollapsibleContentElement,
          priority: 2,
        };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    element.setAttribute('data-lexical-collapsible-content', 'true');
    return {element};
  }

  static importJSON(
    serializedNode: SerializedCollapsibleContentNode,
  ): CollapsibleContentNode {
    return $createCollapsibleContentNode();
  }

  isShadowRoot(): boolean {
    return true;
  }

  exportJSON(): SerializedCollapsibleContentNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-content',
      version: 1,
    };
  }
}

export function $createCollapsibleContentNode(): CollapsibleContentNode {
  return new CollapsibleContentNode();
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode;
}
