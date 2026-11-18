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
  SerializedElementNode
} from 'lexical';

import {addClassNamesToElement} from '@lexical/utils';
import {ElementNode} from 'lexical';
import { useLexicalEditable } from '@lexical/react/useLexicalEditable';

export type SerializedLayoutItemNode = SerializedElementNode;

function $convertLayoutItemElement(): DOMConversionOutput | null {
  return {node: $createLayoutItemNode()};
}

export class LayoutItemNode extends ElementNode {


  static getType(): string {
    return 'layout-item';
  }

  static clone(node: LayoutItemNode): LayoutItemNode {
    return new LayoutItemNode(node.__key);
  }



  createDOM(config: EditorConfig, editor): HTMLElement {
    
    //console.log('editor config', editor)
    //const editable = useLexicalEditable()
    const dom = document.createElement('div');
    dom.setAttribute('data-lexical-layout-item', 'true');
    if (typeof config.theme.layoutItem === 'string') {
      addClassNamesToElement(dom, config.theme.layoutItem, editor?._editable ? config.theme.layoutItemEditable : undefined);

    }
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    // The theme's class, as the live (read-only) editor renders it, so exported and
    // server-rendered HTML lay out like the page; without one, the classes that keep
    // the item inside its grid track (min-w-0 prevents content overflow).
    const element = document.createElement('div');
    const themeClass = editor?._config?.theme?.layoutItem;
    element.className = typeof themeClass === 'string' ? themeClass : 'min-w-0 max-w-full';
    element.setAttribute('data-lexical-layout-item', 'true');
    // the alignment Lexical's reconciler sets on the live element
    const format = this.getFormatType();
    if (format) element.style.textAlign = format;
    return {element};
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-lexical-layout-item')) {
          return null;
        }
        return {
          conversion: $convertLayoutItemElement,
          priority: 2,
        };
      },
    };
  }

  static importJSON(serializedNode: SerializedLayoutItemNode): LayoutItemNode {
    return $createLayoutItemNode().updateFromJSON(serializedNode);
  }

  isShadowRoot(): boolean {
    return true;
  }
}

export function $createLayoutItemNode(editor): LayoutItemNode {
  return  new LayoutItemNode(editor);
}

export function $isLayoutItemNode(
  node: LexicalNode | null | undefined,
): node is LayoutItemNode {
  return node instanceof LayoutItemNode;
}