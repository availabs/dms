/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Klass, LexicalNode, LexicalNodeReplacement} from 'lexical';

import {CodeHighlightNode, CodeNode} from '@lexical/code';
import {HashtagNode} from '@lexical/hashtag';
import {AutoLinkNode, LinkNode} from '@lexical/link';
import {ListItemNode, ListNode} from '@lexical/list';
import {MarkNode} from '@lexical/mark';
import {OverflowNode} from '@lexical/overflow';
import {HorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';


import {CollapsibleContainerNode} from '../plugins/CollapsiblePlugin/CollapsibleContainerNode';
import {CollapsibleButtonNode} from '../plugins/CollapsiblePlugin/CollapsibleToggleButtonNode';
import {CollapsibleContentNode} from '../plugins/CollapsiblePlugin/CollapsibleContentNode';
import {CollapsibleTitleNode} from '../plugins/CollapsiblePlugin/CollapsibleTitleNode';

import {CollapsibleNoPreviewContainerNode} from '../plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewContainerNode';
// import {CollapsibleNoPreviewButtonNode} from '../plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewToggleButtonNode';
import {CollapsibleNoPreviewContentNode} from '../plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewContentNode';
import {CollapsibleNoPreviewTitleNode} from '../plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewTitleNode';
import {AutocompleteNode} from './AutocompleteNode';
// import {EmojiNode} from './EmojiNode';
// import {EquationNode} from './EquationNode';
// import {ExcalidrawNode} from './ExcalidrawNode';
// import {FigmaNode} from './FigmaNode';
// import {ImageNode} from './ImageNode';
import {InlineImageNode} from './InlineImageNode';
import {KeywordNode} from './KeywordNode';
import {LayoutContainerNode} from './LayoutContainerNode';
import {LayoutItemNode} from './LayoutItemNode';
// import {MentionNode} from './MentionNode';
// import {PollNode} from './PollNode';
// import {StickyNode} from './StickyNode';
// import {TableNode as NewTableNode} from './TableNode';
// import {TweetNode} from './TweetNode';
// import {YouTubeNode} from './YouTubeNode';

import {PageBreakNode} from './PageBreakNode';

import { ButtonNode } from './ButtonNode'
import { IconNode } from "./IconNode";
import { StyledParagraphNode } from "./StyledParagraphNode";
import { SafeLinkNode } from './SafeLinkNode';

const PlaygroundNodes: Array<Klass<LexicalNode> | LexicalNodeReplacement> = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  // HashtagNode,
  CodeHighlightNode,
  AutoLinkNode,
  LinkNode,
  OverflowNode,
  //PollNode,
  //StickyNode,
  // ImageNode,
  InlineImageNode,
  // MentionNode,
  // EmojiNode,
  // ExcalidrawNode,
  // EquationNode,
  AutocompleteNode,
  KeywordNode,
  HorizontalRuleNode,
  // TweetNode,
  // YouTubeNode,
  // FigmaNode,
  MarkNode,
  PageBreakNode,

  CollapsibleContainerNode,
  CollapsibleContentNode,
  CollapsibleTitleNode,
  CollapsibleButtonNode,

  CollapsibleNoPreviewContainerNode,
  CollapsibleNoPreviewContentNode,
  CollapsibleNoPreviewTitleNode,
  // CollapsibleNoPreviewButtonNode,

  LayoutContainerNode,
  LayoutItemNode,
  ButtonNode,
  IconNode,
  StyledParagraphNode,

  // Force rel="noopener noreferrer" on target="_blank" links (reverse-tabnabbing).
  // SafeLinkNode (type 'safe-link') is registered as its own klass AND as the replacement
  // for LinkNode, so every link — newly authored or loaded from existing 'link' content —
  // becomes a SafeLinkNode (via $createLinkNode / LinkNode.importJSON → $applyNodeReplacement)
  // and gets the safe rel injected in createDOM. Existing stored 'link' content needs no
  // migration; only newly authored/re-saved links serialize as 'safe-link'.
  SafeLinkNode,
  {
    replace: LinkNode,
    with: (node: LinkNode) =>
      new SafeLinkNode(node.getURL(), {
        rel: node.getRel(),
        target: node.getTarget(),
        title: node.getTitle(),
      }),
    withKlass: SafeLinkNode,
  },
];

export default PlaygroundNodes;
