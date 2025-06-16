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

import { $isCollapsibleContainerNode } from './CollapsibleNoPreviewContainerNode';
import { $isCollapsibleContentNode } from './CollapsibleNoPreviewContentNode';

type SerializedCollapsibleButtonNode = SerializedElementNode;

export function convertButtonElement(domNode: HTMLElement): DOMConversionOutput | null {
  const node = $createCollapsibleButtonNode();
  return { node };
}

export class CollapsibleNoPreviewButtonNode extends ElementNode {
  static getType(): string {
    return 'collapsible-no-preview-button';
  }

  static clone(node: CollapsibleNoPreviewButtonNode): CollapsibleNoPreviewButtonNode {
    return new CollapsibleNoPreviewButtonNode(node.__key);
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const button = document.createElement('button');
    button.classList.add(
        'collapsible-toggle',
        'w-fit', 'h-fit', 'cursor-pointer', 'bg-[#C5D7E0]', 'text-[#37576B]', 'font-semibold', 'leading-[14.62px]',
        'rounded-full', 'text-sm', 'text-center', 'pt-[9px]', 'pb-[7px]', 'px-[12px]'
    );
    const containerNode = this.getParentOrThrow();
    if ($isCollapsibleContainerNode(containerNode)) {
      button.textContent = containerNode.getOpen() ? 'SHOW LESS' : 'SHOW MORE';
    }

    button.addEventListener('click', () => {
      editor.update(() => {
        const containerNode = this.getParentOrThrow();
        if ($isCollapsibleContainerNode(containerNode)) {
          containerNode.toggleOpen();
        }
      })
      button.textContent = button.textContent === 'SHOW LESS' ? 'SHOW MORE' : 'SHOW LESS';
    });

    return button;
  }

  updateDOM(prevNode: CollapsibleNoPreviewButtonNode, dom: HTMLElement): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      button: (domNode: HTMLElement) => {
        return {
          conversion: convertButtonElement,
          priority: 1,
        };
      },
    };
  }

  static importJSON(serializedNode: SerializedCollapsibleButtonNode): CollapsibleNoPreviewButtonNode {
    return $createCollapsibleButtonNode();
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('button');
    element.textContent = 'Toggle Expand';
    return { element };
  }

  exportJSON(): SerializedCollapsibleButtonNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-no-preview-button',
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
      throw new Error('CollapsibleButtonNode expects to be child of CollapsibleContainerNode');
    }

    if (containerNode.getOpen()) {
      const contentNode = this.getNextSibling();
      if (!$isCollapsibleContentNode(contentNode)) {
        throw new Error('CollapsibleButtonNode expects to have CollapsibleContentNode sibling');
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

export function $createCollapsibleButtonNode(): CollapsibleNoPreviewButtonNode {
  return new CollapsibleNoPreviewButtonNode();
}

export function $isCollapsibleButtonNode(node: LexicalNode | null | undefined): node is CollapsibleNoPreviewButtonNode {
  return node instanceof CollapsibleNoPreviewButtonNode;
}