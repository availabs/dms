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
import {Link} from 'react-router-dom'

import {BlockWithAlignableContents} from '@lexical/react/LexicalBlockWithAlignableContents';
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from '@lexical/react/LexicalDecoratorBlockNode';
import * as React from 'react';


function ButtonComponent({
  className,
  format,
  nodeKey,
  linkText,
  path
}) {
  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}>
      <Link className='p-4 rounded bg-slate-300' to={path}>{linkText}</Link>
    </BlockWithAlignableContents>
  );
}

export type SerializedButtonNode = Spread<
  {
    linkText: string;
    path: string;
  },
  SerializedDecoratorBlockNode
>;

function convertButtonElement(
  domNode: HTMLElement,
): null | DOMConversionOutput {
  const linkText = domNode.innerText
  const path = domNode.getAttribute('href') //getAttribute('data-lexical-button');
  if (linkText) {
    const node = $createButtonNode(linkText, path);
    return {node};
  }
  return null;
}

export class ButtonNode extends DecoratorBlockNode {
  __linkText: string;
  __path: string;

  static getType(): string {
    return 'button';
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(node.__linkText, node.__linkText, node.__format, node.__key);
  }

  static importJSON(serializedNode: SerializedYouTubeNode): ButtonNode {
    const node = $createButtonNode(serializedNode.linkText, serializedNode.path);
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
    };
  }

  constructor(linkText: string, path?: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key);
    this.__linkText = linkText;
    this.__path = path;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div');
    element.setAttribute('href', this.__path);
    element.setAttribute('data-lexical-button', 'true');
    element.innerText = this.__linkText
    
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

  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined,
  ): string {
    return `https://www.youtube.com/watch?v=${this.__id}`;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {};
    const className = {
      base: embedBlockTheme.base || '',
      focus: embedBlockTheme.focus || '',
    };
    return (
      <ButtonComponent
        className={className}
        format={this.__format}
        nodeKey={this.getKey()}
        videoID={this.__id}
      />
    );
  }

  isInline(): false {
    return false;
  }
}

export function $createButtonNode(videoID: string): YouTubeNode {
  return new YouTubeNode(videoID);
}

export function $isYouTubeNode(
  node: YouTubeNode | LexicalNode | null | undefined,
): node is YouTubeNode {
  return node instanceof YouTubeNode;
}
