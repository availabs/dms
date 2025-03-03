import {
  $createParagraphNode,
  $isElementNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
  SerializedElementNode,
} from 'lexical';

import { $isCollapsibleContainerNode } from './CollapsibleContainerNode';
import { $isCollapsibleContentNode } from './CollapsibleContentNode';

type SerializedCollapsibleButtonNode = SerializedElementNode;

export function convertButtonElement(domNode: HTMLElement): DOMConversionOutput | null {
  const node = $createCollapsibleButtonNode();
  return { node };
}

export class CollapsibleButtonNode extends ElementNode {
  static getType(): string {
    return 'collapsible-button';
  }

  static clone(node: CollapsibleButtonNode): CollapsibleButtonNode {
    return new CollapsibleButtonNode(node.__key);
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

  updateDOM(prevNode: CollapsibleButtonNode, dom: HTMLElement): boolean {
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

  static importJSON(serializedNode: SerializedCollapsibleButtonNode): CollapsibleButtonNode {
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
      type: 'collapsible-button',
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

export function $createCollapsibleButtonNode(): CollapsibleButtonNode {
  return new CollapsibleButtonNode();
}

export function $isCollapsibleButtonNode(node: LexicalNode | null | undefined): node is CollapsibleButtonNode {
  return node instanceof CollapsibleButtonNode;
}