/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {EditorThemeClasses} from 'lexical';

import './PlaygroundEditorTheme.css';

const theme: EditorThemeClasses = {
  blockCursor: `block pointer-events-none absolute content-['']  after:absolute after:-top-[2px] after:w-[20px] after:border-t-[1px_solid_black]`,
  characterLimit: 'inline !bg-[#ffbbbb]',
  code: `bg-[rgb(240,_242,_245)] font-[Menlo,_Consolas,_Monaco,_monospace] block pl-[52px] pr-[8px] py-[8px] leading-[1.53] text-[13px] m-0 mt-[8px] mb-[8px] [tab-size:2] relative after:content-[attr(data-gutter)] after:absolute after:bg-[#eee] after:left-[0] after:top-[0] after:border-r-[1px_solid_#ccc] after:p-[8px] after:text-[#777] after:whitespace-pre-wrap after:text-right after:min-w-[25px]`,
  codeHighlight: {
    atrule: 'text-[#07a]',
    attr: 'text-[#07a]',
    boolean: 'text-[#905]',
    builtin: 'text-[#690]',
    cdata: 'text-[slategray]',
    char: 'text-[#690]',
    class: 'text-[#dd4a68]',
    'class-name': 'text-[#dd4a68]',
    comment: 'text-[slategray]',
    constant: 'text-[#905]',
    deleted: 'text-[#905]',
    doctype: 'text-[slategray]',
    entity: 'text-[#9a6e3a]',
    function: 'text-[#dd4a68]',
    important: 'text-[#e90]',
    inserted: 'text-[#690]',
    keyword: 'text-[#07a]',
    namespace: 'text-[#e90]',
    number: 'text-[#905]',
    operator: 'text-[#9a6e3a]',
    prolog: 'text-[slategray]',
    property: 'text-[#905]',
    punctuation: 'text-[#999]',
    regex: 'text-[#e90]',
    selector: 'text-[#690]',
    string: 'text-[#690]',
    symbol: 'text-[#905]',
    tag: 'text-[#905]',
    url: 'text-[#9a6e3a]',
    variable: 'text-[#e90]',
  },
  embedBlock: {
    base: 'select-none',
    focus: 'outline-[2px_solid_rgb(60,_132,_244)]',
  },
  hashtag: 'bg-[rgba(88,_144,_255,_0.15)] border-b-[1px_solid_rgba(88,_144,_255,_0.3)]',
  heading: {
    h1: 'font-semibold text-2xl scroll-mt-36 font-display', //'PlaygroundEditorTheme__h1',
    h2: 'font-medium text-xl scroll-mt-36 font-display', //'PlaygroundEditorTheme__h2',
    h3: 'font-medium text-lg scroll-mt-36 font-display', //'PlaygroundEditorTheme__h3',
    h4: 'font-medium scroll-mt-36 font-display', //'PlaygroundEditorTheme__h4',
    h5: 'scroll-mt-36 font-display', //'PlaygroundEditorTheme__h5',
    h6: 'scroll-mt-36 font-display', //'PlaygroundEditorTheme__h6',
  },
  image: 'editor-image',
  indent: 'PlaygroundEditorTheme__indent',
  inlineImage: 'inline-editor-image',
  link: 'PlaygroundEditorTheme__link',
  list: {
    listitem: 'PlaygroundEditorTheme__listItem',
    listitemChecked: 'PlaygroundEditorTheme__listItemChecked',
    listitemUnchecked: 'PlaygroundEditorTheme__listItemUnchecked',
    nested: {
      listitem: 'PlaygroundEditorTheme__nestedListItem',
    },
    olDepth: [
      'PlaygroundEditorTheme__ol1 list-decimal',
      'PlaygroundEditorTheme__ol2',
      'PlaygroundEditorTheme__ol3',
      'PlaygroundEditorTheme__ol4',
      'PlaygroundEditorTheme__ol5',
    ],
    ul: 'PlaygroundEditorTheme__ul',
  },
  ltr: 'PlaygroundEditorTheme__ltr',
  mark: 'PlaygroundEditorTheme__mark',
  markOverlap: 'PlaygroundEditorTheme__markOverlap',
  paragraph: 'PlaygroundEditorTheme__paragraph',
  quote: 'PlaygroundEditorTheme__quote',
  rtl: 'PlaygroundEditorTheme__rtl',
  table: 'PlaygroundEditorTheme__table',
  tableAddColumns: 'PlaygroundEditorTheme__tableAddColumns',
  tableAddRows: 'PlaygroundEditorTheme__tableAddRows',
  tableCell: 'PlaygroundEditorTheme__tableCell',
  tableCellActionButton: 'PlaygroundEditorTheme__tableCellActionButton',
  tableCellActionButtonContainer:
    'PlaygroundEditorTheme__tableCellActionButtonContainer',
  tableCellEditing: 'PlaygroundEditorTheme__tableCellEditing',
  tableCellHeader: 'PlaygroundEditorTheme__tableCellHeader',
  tableCellPrimarySelected: 'PlaygroundEditorTheme__tableCellPrimarySelected',
  tableCellResizer: 'PlaygroundEditorTheme__tableCellResizer',
  tableCellSelected: 'PlaygroundEditorTheme__tableCellSelected',
  tableCellSortedIndicator: 'PlaygroundEditorTheme__tableCellSortedIndicator',
  tableResizeRuler: 'PlaygroundEditorTheme__tableCellResizeRuler',
  tableSelected: 'PlaygroundEditorTheme__tableSelected',
  text: {
    bold: 'PlaygroundEditorTheme__textBold',
    code: 'PlaygroundEditorTheme__textCode',
    italic: 'PlaygroundEditorTheme__textItalic',
    strikethrough: 'PlaygroundEditorTheme__textStrikethrough',
    subscript: 'PlaygroundEditorTheme__textSubscript',
    superscript: 'PlaygroundEditorTheme__textSuperscript',
    underline: 'PlaygroundEditorTheme__textUnderline',
    underlineStrikethrough: 'PlaygroundEditorTheme__textUnderlineStrikethrough',
  },
};

export default theme;
