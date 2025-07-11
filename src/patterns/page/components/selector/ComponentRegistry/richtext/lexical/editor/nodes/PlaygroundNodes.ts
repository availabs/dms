/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Klass, LexicalNode} from 'lexical';

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

import { ButtonNode } from './ButtonNode'
import { IconNode } from "./IconNode";

const PlaygroundNodes: Array<Klass<LexicalNode>> = [
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
  IconNode
];

export default PlaygroundNodes;
