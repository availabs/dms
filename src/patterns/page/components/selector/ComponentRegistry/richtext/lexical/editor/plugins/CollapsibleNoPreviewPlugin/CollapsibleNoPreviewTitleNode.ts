/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  $createParagraphNode,
  $isElementNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type SerializedElementNode,
} from 'lexical';

import {$isCollapsibleContainerNode} from './CollapsibleNoPreviewContainerNode';
import {$isCollapsibleContentNode} from './CollapsibleNoPreviewContentNode';

type SerializedCollapsibleTitleNode = SerializedElementNode;

export function convertSummaryElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const node = $createCollapsibleTitleNode();
  return {
    node,
  };
}

export class CollapsibleNoPreviewTitleNode extends ElementNode {
  static getType(): string {
    return 'collapsible-no-preview-title';
  }

  static clone(node: CollapsibleNoPreviewTitleNode): CollapsibleNoPreviewTitleNode {
    return new CollapsibleNoPreviewTitleNode(node.__key);
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const containerNode = this.getParentOrThrow();
    const isOpen = containerNode.getOpen();
    const dom = document.createElement('div');

    dom.classList.add(
        'Collapsible__title',
        'flex', 'flex-row', 'w-full', 'font-[Oswald]', 'font-medium', 'text-[12px]',
        'text-[#2D3E4C]', 'uppercase', 'pb-[12px]',
        'flex', 'items-center', 'gap-2' // Ensure the icon and text align properly
    );

    if(isOpen){
      dom.classList.add(
          'border-b', 'border-[#C5D7E0]'
      );
    }else{
      dom.classList.remove(
          'border-b', 'border-[#C5D7E0]'
      );
    }
    // Create an icon (using an inline SVG)
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "24");
    icon.setAttribute("height", "24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("id", "find-me");
    icon.innerHTML = `
         <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    `;
    icon.classList.add("inline-block", "align-middle", "cursor-pointer", "absolute", "right-2");

    icon.addEventListener('click', () => {
        console.log('icon clicked')
      editor.update(() => {
          const containerNode = this.getParentOrThrow();
        // containerNode.toggleOpen();
        if ($isCollapsibleContainerNode(containerNode)) {
            const isOpen = containerNode.getOpen();
            console.log('isopen', isOpen)
          if(isOpen){
              containerNode.setOpen(false)
            dom.classList.remove(
                'border-b', 'border-[#C5D7E0]'
            );
          }else{
              containerNode.setOpen(true)
            dom.classList.add(
                'border-b', 'border-[#C5D7E0]'
            );
          }
            this.markDirty(); // Ensure Lexical recognizes updates
            // containerNode.toggleOpen();
        }
      })
    });
    // Append icon before the title text
    dom.appendChild(icon);

    dom.addEventListener('click', (e) => {
      e.preventDefault();
    });

    return dom;
  }


  updateDOM(prevNode: CollapsibleNoPreviewTitleNode, dom: HTMLElement): boolean {
    if (prevNode.__open !== this.__open) {
      dom.open = this.__open;
      dom.style.maxHeight = this.__open ? 'none' : '50px';
      this.getChildren().forEach((child) => child.markDirty());
    }

    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      summary: (domNode: HTMLElement) => {
        return {
          conversion: convertSummaryElement,
          priority: 1,
        };
      },
    };
  }

  static importJSON(
    serializedNode: SerializedCollapsibleTitleNode,
  ): CollapsibleNoPreviewTitleNode {
    return $createCollapsibleTitleNode();
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('summary');
    return {element};
  }

  exportJSON(): SerializedCollapsibleTitleNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-no-preview-title',
      version: 1,
    };
  }

  collapseAtStart(_selection: RangeSelection): boolean {
    this.getParentOrThrow().insertBefore(this);
    return true;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    const containerNode = this.getParentOrThrow();

    if (!$isCollapsibleContainerNode(containerNode)) {
      throw new Error(
        'CollapsibleTitleNode expects to be child of CollapsibleContainerNode',
      );
    }

    if (containerNode.getOpen()) {
      const contentNode = this.getNextSibling();
      if (!$isCollapsibleContentNode(contentNode)) {
        throw new Error(
          'CollapsibleTitleNode expects to have CollapsibleContentNode sibling',
        );
      }

      const firstChild = contentNode.getFirstChild();
      if ($isElementNode(firstChild)) {
        return firstChild;
      } else {
        const paragraph = $createParagraphNode();
        contentNode.append(paragraph);
        return paragraph;
      }
    } else {
      const paragraph = $createParagraphNode();
      containerNode.insertAfter(paragraph, restoreSelection);
      return paragraph;
    }
  }
}

export function $createCollapsibleTitleNode(): CollapsibleNoPreviewTitleNode {
  return new CollapsibleNoPreviewTitleNode();
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleNoPreviewTitleNode {
  return node instanceof CollapsibleNoPreviewTitleNode;
}
