/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const theme = {

  contentEditable: 'border-none relative [tab-size:1] outline-0',
  editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0 resize-y", //'editor-scroller'
  viewScroller:
    "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
  editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
  editorShell: "font-['Proxima_Nova'] font-[400] text-[16px] text-[#37576B] leading-[22.4px]",
  card: 'p-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]', 
  heading: {
      h1: "font-[500]  text-[#2D3E4C] text-[36px] leading-[36px] tracking-[-.02em] font-[500] underline-offset-8 underline decoration-4 decoration-[#EAAD43] uppercase font-['Oswald'] pb-[12px]", //'PlaygroundEditorTheme__h1',
      h2: "font-[500]  text-[#2D3E4C] text-[24px] leading-[24px] scroll-mt-36 font-['Oswald'] pb-[12x]", //'PlaygroundEditorTheme__h2',
      h3: "font-[500]  text-[#2D3E4C] text-[16px] leading-[16px] scroll-mt-36 font-['Oswald'] pb-[12x]", //'PlaygroundEditorTheme__h3',
      h4: "font-medium text-[#2D3E4C] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h4',
      h5: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h5',
      h6: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h6',
  },
  paragraph: "m-0 relative", //'PlaygroundEditorTheme__paragraph',
  
  quote: "m-0 mb-2 font-['Oswald'] text-[30px] leading-[36px] text-[#2D3E4C] border-l-4 border-[#37576B] pl-4 pb-[12px]", //'PlaygroundEditorTheme__quote',
  // editorShell: "rounded-[2px] relative", //'.editor-shell',
  
  // quote:
  //   "m-0 ml-5 mb-2 text-[15px] text-[rgb(101,103,107)] border-l-4 border-l-[rgb(206,208,212)] pl-4", //'PlaygroundEditorTheme__quote',
  text: {
    bold: "font-[700]", //'PlaygroundEditorTheme__textBold',
    code: "bg-gray-200 px-1 py-0.5 font-mono text-[94%]", //'PlaygroundEditorTheme__textCode',
    italic: "italic", //'PlaygroundEditorTheme__textItalic',
    strikethrough: "line-through", //'PlaygroundEditorTheme__textStrikethrough',
    subscript: "align-sub text-[0.8em]", //'PlaygroundEditorTheme__textSubscript',
    superscript: "align-super text-[0.8em]", //'PlaygroundEditorTheme__textSuperscript',
    underline: "underline", //'PlaygroundEditorTheme__textUnderline',
    underlineStrikethrough: "underline line-through", //'PlaygroundEditorTheme__textUnderlineStrikethrough',
  },
  blockCursor: `block pointer-events-none absolute content-['']  after:absolute after:-top-[2px] after:w-[20px] after:border-t-[1px_solid_black]`,
  characterLimit: "inline !bg-[#ffbbbb]",
  layoutContainer: 'grid gap-[10px]',
  layoutItem: 'border border-dashed border-slate-300 rounded-lg px-2 py-4 min-w-0 max-w-full',
  code: `bg-[rgb(240,_242,_245)] font-[Menlo,_Consolas,_Monaco,_monospace] block pl-[52px] pr-[8px] py-[8px] leading-[1.53] text-[13px] m-0 mt-[8px] mb-[8px] [tab-size:2] relative after:content-[attr(data-gutter)] after:absolute after:bg-[#eee] after:left-[0] after:top-[0] after:border-r-[1px_solid_#ccc] after:p-[8px] after:text-[#777] after:whitespace-pre-wrap after:text-right after:min-w-[25px]`,
  codeHighlight: {
    atrule: "text-[#07a]",
    attr: "text-[#07a]",
    boolean: "text-[#905]",
    builtin: "text-[#690]",
    cdata: "text-[slategray]",
    char: "text-[#690]",
    class: "text-[#dd4a68]",
    "class-name": "text-[#dd4a68]",
    comment: "text-[slategray]",
    constant: "text-[#905]",
    deleted: "text-[#905]",
    doctype: "text-[slategray]",
    entity: "text-[#9a6e3a]",
    function: "text-[#dd4a68]",
    important: "text-[#e90]",
    inserted: "text-[#690]",
    keyword: "text-[#07a]",
    namespace: "text-[#e90]",
    number: "text-[#905]",
    operator: "text-[#9a6e3a]",
    prolog: "text-[slategray]",
    property: "text-[#905]",
    punctuation: "text-[#999]",
    regex: "text-[#e90]",
    selector: "text-[#690]",
    string: "text-[#690]",
    symbol: "text-[#905]",
    tag: "text-[#905]",
    url: "text-[#9a6e3a]",
    variable: "text-[#e90]",
  },
  embedBlock: {
    base: "select-none",
    focus: "outline-[2px_solid_rgb(60,_132,_244)]",
  },
  hashtag:
    "bg-[rgba(88,_144,_255,_0.15)] border-b-[1px_solid_rgba(88,_144,_255,_0.3)]",
  
  image: "editor-image",
  indent: "PlaygroundEditorTheme__indent",
  link: "text-[rgb(33,111,219)] no-underline inline-block hover:underline hover:cursor-pointer", //"PlaygroundEditorTheme__link",
  list: {
    listitem: "mx-[32px]", //PlaygroundEditorTheme__listItem
    listitemChecked: "PlaygroundEditorTheme__listItemChecked",
    listitemUnchecked: "PlaygroundEditorTheme__listItemUnchecked",
    nested: {
      listitem: "list-none before:hidden after:hidden", //"PlaygroundEditorTheme__nestedListItem",
    },
    olDepth: [
      "list-inside list-decimal m-0 p-0 ", //'PlaygroundEditorTheme__ol1 list-decimal',
      "m-0 p-0 list-inside list-alpha", //'PlaygroundEditorTheme__ol2',
      "m-0 p-0 list-inside list-lower-alpha", //'PlaygroundEditorTheme__ol3',
      "m-0 p-0 list-inside list-upper-roman", //'PlaygroundEditorTheme__ol4',
      "m-0 p-0 list-inside list-lower-roman", //'PlaygroundEditorTheme__ol5',
    ],
    ul: "m-0 p-0 list-inside list-disc", //'PlaygroundEditorTheme__ul',
  },
  token: {
    comment: "text-slate-500", // slategray
    punctuation: "text-gray-400", // #999
    property: "text-[#905]", // #905
    selector: "text-[#690]", // #690
    operator: "text-[#9a6e3a]", // #9a6e3a
    attr: "text-[#07a]", // #07a
    variable: "text-[#e90]", // #e90
    function: "text-[#dd4a68]", // #dd4a68
  },
  ltr: "text-left", //'PlaygroundEditorTheme__ltr',
  mark: {
    base: "bg-[rgba(255, 212, 0, 0.14)] border-b-2 border-[rgba(255, 212, 0, 0.3)] pb-0.5", //'PlaygroundEditorTheme__mark'
    selected:
      "bg-[rgba(255, 212, 0, 0.5)] border-b-2 border-[rgba(255, 212, 0, 1)]", //'PlaygroundEditorTheme__mark . selected'
  },
  markOverlap: {
    base: "bg-[rgba(255,212,0,0.3)] border-b-2 border-b-[rgba(255,212,0,0.7)]", //'PlaygroundEditorTheme__markOverlap',
    selected:
      "bg-[rgba(255,212,0,0.7)] border-b-2 border-b-[rgba(255,212,0,0.7)]", //'PlaygroundEditorTheme__markOverlap .selected'
  },
  
  rtl: "text-right", //'PlaygroundEditorTheme__rtl',
  table:
    "border-collapse border-spacing-0 max-w-full overflow-y-scroll table-fixed w-[calc(100%-25px)] my-7", //'PlaygroundEditorTheme__table',
  tableAddColumns:
    "relative top-0 w-[20px] bg-gray-200 h-full right-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url(/images/icons/plus.svg)] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40", //'PlaygroundEditorTheme__tableAddColumns',
  tableAddRows:
    "absolute bottom-[-25px] w-[calc(100%-25px)] bg-gray-200 h-[20px] left-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url(/images/icons/plus.svg)] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40", //'PlaygroundEditorTheme__tableAddRows',
  /*
    tableCell: 'PlaygroundEditorTheme__tableCell',
  tableCellActionButton: 'PlaygroundEditorTheme__tableCellActionButton',
  tableCellActionButtonContainer:
    'PlaygroundEditorTheme__tableCellActionButtonContainer',
  tableCellHeader: 'PlaygroundEditorTheme__tableCellHeader',
  tableCellResizer: 'PlaygroundEditorTheme__tableCellResizer',
  tableCellSelected: 'PlaygroundEditorTheme__tableCellSelected',
  */

  tableCell:
    "border border-gray-400 min-w-[75px] align-top text-left px-2 py-[6px] relative cursor-default outline-none", //'PlaygroundEditorTheme__tableCell',
  tableCellActionButton:
    "bg-gray-200 block border-0 rounded-full w-5 h-5 text-gray-900 cursor-pointer hover:bg-gray-300", //'PlaygroundEditorTheme__tableCellActionButton',
  tableCellActionButtonContainer: "block absolute right-1 top-1.5 z-40 w-5 h-5", //'PlaygroundEditorTheme__tableCellActionButtonContainer',
  tableCellEditing: "shadow-[0_0_5px_rgba(0,0,0,0.4)] rounded-[3px]", //'PlaygroundEditorTheme__tableCellEditing',
  tableCellHeader: "bg-[#f2f3f5] text-left", //'PlaygroundEditorTheme__tableCellHeader',
  tableCellPrimarySelected:
    "border-2 border-[rgb(60,132,244)] absolute h-[calc(100%-2px)] w-[calc(100%-2px)] left-[-1px] top-[-1px] z-2", //'PlaygroundEditorTheme__tableCellPrimarySelected',
  tableCellResizer:
    "absolute right-[-4px] h-full w-[8px] cursor-ew-resize z-10 top-0", //'PlaygroundEditorTheme__tableCellResizer',
  tableCellSelected: "bg-[#c9dbf0]", //'PlaygroundEditorTheme__tableCellSelected',
  tableCellSortedIndicator:
    "block opacity-50 absolute bottom-0 left-0 w-full h-[4px] bg-[#999]", //'PlaygroundEditorTheme__tableCellSortedIndicator',
  tableResizeRuler: "block absolute w-[1px] bg-[rgb(60,132,244)] h-full top-0", //'PlaygroundEditorTheme__tableCellResizeRuler',
  tableSelected: "outline outline-2 outline-[rgb(60,132,244)]", //'PlaygroundEditorTheme__tableSelected',
  charLimit: "inline bg-[#ffbbbb] !important", //PlaygroundEditorTheme__characterLimit
  

  // lexical stuff

  
  editorEditTreeView: "rounded-none", // .editor-shell .editor-container.tree-view
  editorViewContainer: "relative block rounded-[10px]", // .editor-shell .view-container
  editorViewTreeView: "rounded-none", // .editor-shell .view-container.tree-view
  editorPlanText: "rounded-t-[10px]", // .editor-shell .view-container.plain-text
  
  // editor: "flex-auto relative resize-y z-negative", //editor
  testRecorderOutput: "my-5 mx-auto w-full", //test-recorder-output
  treeViewOutput:
    "block bg-gray-900 text-white p-0 text-xs my-[1px] mx-auto mb-[10px] relative overflow-hidden rounded-lg", //tree-view-output
  editorDevButton: {
    base: "relative block w-10 h-10 text-xs rounded-[20px] border-none cursor-pointer outline-none shadow-[0px_1px_10px_rgba(0,0,0,0.3)] bg-gray-700 hover:bg-gray-600 after:content-[''] after:absolute after:top-[10px] after:right-[10px] after:bottom-[10px] after:left-[10px] after:block after:bg-contain after:filter invert", //editor-dev-button
    active: "bg-red-600", //editor-dev-button .active
  },
  testRecorderToolbar: "flex", //test-recorder-toolbar
  testRecorderButton: {
    base: "relative block w-8 h-8 text-xs p-[6px] rounded-md border-none cursor-pointer outline-none shadow-md bg-gray-800 transition-shadow duration-75 ease-out after:content-[''] after:absolute after:top-2 after:right-2 after:bottom-2 after:left-2 after:block after:bg-contain after:filter-invert", //test-recorder-button
    active: "shadow-lg", //test-recorder-button .active
  },
  componentPickerMenu: "w-[200px]", //component-picker-menu
  mentionsMenu: "w-[250px]", // mentions-menu
  autoEmbedMenu: "w-[150px]", //auto-embed-menu
  emojiMenu: "w-[200px]", //emoji-menu
  icon: {
    plus: "bg-[url(/images/icons/plus.svg)]",
    caretRight: "bg-[url(/images/icons/caret-right-fill.svg)]",
    columns: "bg-[url(/images/icons/3-columns.svg)]",
    dropdownMore: "bg-[url(/images/icons/dropdown-more.svg)]",
    fontColor: "bg-[url(/images/icons/font-color.svg)]",
    fontFamily: "bg-[url(/images/icons/font-family.svg)]",
    bgColor: "bg-[url(/images/icons/bg-color.svg)]",
    table:
      "bg-[#6c757d] bg-[url(/images/icons/table.svg)]  mask-[url(/images/icons/table.svg)] mask-no-repeat mask-size-contain",
    paragraph: "bg-[url(/images/icons/text-paragraph.svg)]",
    h1: "bg-[url(/images/icons/type-h1.svg)]",
    h2: "bg-[url(/images/icons/type-h2.svg)]",
    h3: "bg-[url(/images/icons/type-h3.svg)]",
    h4: "bg-[url(/images/icons/type-h4.svg)]",
    h5: "bg-[url(/images/icons/type-h5.svg)]",
    h6: "bg-[url(/images/icons/type-h6.svg)]",
    bulletList: "bg-[url(/images/icons/list-ul.svg)]",
    bullet: "bg-[url(/images/icons/list-ul.svg)]", // Repeated for .icon.bullet
    checkList: "bg-[url(/images/icons/square-check.svg)]",
    check: "bg-[url(/images/icons/square-check.svg)]", // Repeated for .icon.check
    numberedList: "bg-[url(/images/icons/list-ol.svg)]",
    number: "bg-[url(/images/icons/list-ol.svg)]", // Repeated for .icon.number
    quote: "bg-[url(/images/icons/chat-square-quote.svg)]",
    code: "bg-[url(/images/icons/code.svg)]",
    strikethrough: "bg-[url(/images/icons/type-strikethrough.svg)]",
    subscript: "bg-[url(/images/icons/type-subscript.svg)]",
    superscript: "bg-[url(/images/icons/type-superscript.svg)]",
    palette: "bg-[url(/images/icons/palette.svg)]",
    bucket: "bg-[url(/images/icons/paint-bucket.svg)]",
    bold: "bg-[url(/images/icons/type-bold.svg)]",
    italic: "bg-[url(/images/icons/type-italic.svg)]",
    clear: "bg-[url(/images/icons/trash.svg)]",
    underline: "bg-[url(/images/icons/type-underline.svg)]",
    link: "bg-[url(/images/icons/link.svg)]",
    horizontalRule: "bg-[url(/images/icons/horizontal-rule.svg)]",
    centerAlign: "bg-[url(/images/icons/text-center.svg)]",
    rightAlign: "bg-[url(/images/icons/text-right.svg)]",
    justifyAlign: "bg-[url(/images/icons/justify.svg)]",
    indent: "bg-[url(/images/icons/indent.svg)]",
    markdown: "bg-[url(/images/icons/markdown.svg)]",
    outdent: "bg-[url(/images/icons/outdent.svg)]",
    undo: "bg-[url(/images/icons/arrow-counterclockwise.svg)]",
    redo: "bg-[url(/images/icons/arrow-clockwise.svg)]",
    sticky: "bg-[url(/images/icons/sticky.svg)]",
    mic: "bg-[url(/images/icons/mic.svg)]",
    import: "bg-[url(/images/icons/upload.svg)]",
    export: "bg-[url(/images/icons/download.svg)]",
    diagram2: "bg-[url(/images/icons/diagram-2.svg)]",
    user: "bg-[url(/images/icons/user.svg)]",
    equation: "bg-[url(/images/icons/plus-slash-minus.svg)]",
    gif: "bg-[url(/images/icons/filetype-gif.svg)]",
    copy: "bg-[url(/images/icons/copy.svg)]",
    success: "bg-[url(/images/icons/success.svg)]",
    prettier: "bg-[url(/images/icons/prettier.svg)]",
    prettierError: "bg-[url(/images/icons/prettier-error.svg)]",
    image: "bg-[url(/images/icons/file-image.svg)]",
    close: "bg-[url(/images/icons/close.svg)]",
    figma: "bg-[url(/images/icons/figma.svg)]",
    poll: "bg-[url(/images/icons/card-checklist.svg)]",
    tweet: "bg-[url(/images/icons/tweet.svg)]",
    youtube: "bg-[url(/images/icons/youtube.svg)]",
    leftAlign: "bg-[url(/images/icons/text-left.svg)]",
  },
  iconChevronDown:
    "bg-transparent bg-contain inline-block h-[8px] w-[8px] bg-[url(/images/icons/chevron-down.svg)]", // i.chevron-down
  switch: {
    base: "block text-gray-700 my-[5px] bg-gray-200 bg-opacity-70 py-[5px] px-[10px] rounded-lg", // switch
    richTextSwitch: "absolute right-0", // #rich-text-switch
    characterCountSwitch: "absolute right-[130px]", // #character-count-switch
    label:
      "mr-1 line-height-[24px] w-[100px] text-[14px] inline-block align-middle", // .switch label
    button:
      "bg-[rgb(206,208,212)] h-[24px] box-border rounded-[12px] w-[44px] inline-block align-middle relative outline-none cursor-pointer transition-colors duration-[100ms] border-[2px] border-transparent focus-visible:border-blue-500", // .switch button
    buttonSpan:
      "absolute top-0 left-0 block w-[20px] h-[20px] rounded-[12px] bg-white transition-transform duration-[200ms]",
    buttonChecked: "bg-[rgb(24,119,242)]",
    buttonCheckedSpan: "translate-x-[20px]",
  },
  linkEditor: {
    base: "flex absolute top-0 left-0 z-10 max-w-[400px] w-full opacity-0 bg-white shadow-lg rounded-b-lg transition-opacity duration-500 will-change-transform", // .link-editor
    button: {
      active: "bg-[rgb(223,232,250)]", // .link-editor .button.active,
      base: "w-[20px] h-[20px] inline-block p-[6px] rounded-lg cursor-pointer mx-[2px]", // .link-editor .button
      hovered: "w-[20px] h-[20px] inline-block bg-gray-200", // .link-editor .button.hovered,
      i: "bg-contain inline-block h-[20px] w-[20px] align-middle", // .link-editor .button i
    },
    linkInput: {
      base: "block w-[calc(100%-75px)] box-border m-3 p-2 rounded-[15px] bg-[#eee] text-[15px] text-[rgb(5,5,5)] border-0 outline-0 relative font-inherit", // .link-editor .link-input
      a: "text-[rgb(33,111,219)] underline whitespace-nowrap overflow-hidden mr-[30px] overflow-ellipsis hover:underline", // .link-editor .link-input
    },
    linkView: {
      base: "block w-[calc(100%-24px)] m-2 p-2 rounded-[15px] text-[15px] text-[rgb(5,5,5)] border-0 outline-0 relative font-inherit", // link-editor .link-view
      a: "block break-words w-[calc(100%-33px)]", //.link-editor .link-view a
    },
    div: {
      linkEdit:
        "bg-[url(/images/icons/pencil-fill.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-[30px] top-0 bottom-0 cursor-pointer", //.link-editor div.link-edit
      linkTrash:
        "bg-[url(/images/icons/trash.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer", //.link-editor div.link-trash
      linkCancel:
        "bg-[url(/images/icons/close.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[28px]", //.link-editor div.link-cancel
      linkConfirm:
        "bg-[url(/images/icons/success-alt.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[2px]", //link-editor div.link-confirm
    },
    fontSizeWrapper: "flex mx-[4px]", // .link-editor .font-size-wrapper,
    fontFamilyWrapper: "flex mx-[4px]", // .link-editor .font-family-wrapper
    select: "p-[6px] border-0 bg-[rgba(0,0,0,0.075)] rounded-[4px]", // .link-editor select
    // button: 'w-5 h-5 inline-block p-1.5 rounded-lg cursor-pointer mx-0.5', // .link-editor .button
    buttonHovered: "w-5 h-5 inline-block bg-gray-200", // .link-editor .button.hovered
    icon: "bg-contain inline-block h-5 w-5 align-middle", // .link-editor .button i, .actions i
  },
  mention: {
    focus: "shadow-[0_0_0_2px_rgb(180,213,255)] outline-none", //.mention:focus
  },
  blockControls: {
    base: "absolute right-2 top-4 w-8 h-8 box-border shadow-md z-10 rounded-lg border border-gray-300 overflow-hidden", // #block-controls
    button: {
      base: "border border-white bg-white block transition-colors duration-100 ease-in cursor-pointer outline-none rounded-lg p-1 hover:bg-gray-200", // #block-controls button
      focusVisible: "focus-visible:border-blue-500", // #block-controls button:focus-visible
    },
    span: {
      base: "block w-[18px] h-[18px] m-[2px] bg-contain", // #block-controls span.block-type
      paragraph: "bg-[url(/images/icons/text-paragraph.svg)]", // #block-controls span.block-type.paragraph
      h1: "bg-[url(/images/icons/type-h1.svg)]", // #block-controls span.block-type.h1
      h2: "bg-[url(/images/icons/type-h2.svg)]", // #block-controls span.block-type.h2
      quote: "bg-[url(/images/icons/chat-square-quote.svg)]", //#block-controls span.block-type.quote
      ul: "bg-[url(/images/icons/list-ul.svg)]", //#block-controls span.block-type.ul
      ol: "bg-[url(/images/icons/list-ol.svg)]", //#block-controls span.block-type.ol
      code: "bg-[url(/images/icons/code.svg)]", //#block-controls span.block-type.code
    },
  },
  charactersLimit: {
    base: "text-gray-400 text-xs text-right block absolute left-3 bottom-1", // .characters-limit
    exceeded: "text-red-500", // .characters-limit.characters-limit-exceeded
  },
  dropdown: {
    base: "z-10 block fixed shadow-lg rounded-[8px] min-h-[40px] bg-white", // .dropdown
    item: {
      base: "m-0 mx-2 p-2 text-[#050505] cursor-pointer leading-4 text-[15px] flex items-center flex-row flex-shrink-0 justify-between bg-white rounded-lg border-0 max-w-[250px] min-w-[100px] hover:bg-gray-200", //.dropdown .item
      fontSizeItem: "min-w-unset", //.dropdown .item.fontsize-item
      fontSizeText: "min-w-unset", // .dropdown .item.fontsize-item .text
      active: "flex w-5 h-5 bg-contain", // .dropdown .item .active
      firstChild: "mt-2", // .dropdown .item:first-child
      lastChild: "mb-2", // .dropdown .item:last-child
      text: "flex leading-5 flex-grow min-w-[150px]", //.dropdown .item .text
      icon: "flex w-5 h-5 select-none mr-3 leading-4 bg-contain bg-center bg-no-repeat", // .dropdown .item .icon
    },
    divider: "w-auto bg-gray-200 my-1 h-[1px] mx-2", // .dropdown .divider
  },
  switchbase:
    "block text-gray-700 my-1 bg-[rgba(238,_238,_238,_0.7)] p-1 px-[10px] rounded-lg", //.switch
  switchlabel: "mr-1 leading-6 w-[100px] text-sm inline-block align-middle", // .switch label
  switchbutton:
    "bg-gray-300 h-[24px] box-border rounded-full w-[44px] inline-block align-middle relative outline-none cursor-pointer transition-colors duration-100 border-2 border-transparent", //.switch button
  switchbuttonFocus: "focus-visible:border-blue-500", // .switch button:focus-visible
  switchbuttonSpan:
    "absolute top-0 left-0 block w-[20px] h-[20px] rounded-full bg-white transition-transform duration-200", //.switch button span
  switchbuttonChecked: "bg-blue-600", // .switch button[aria-checked='true']
  switchbuttonCheckedSpan: "translate-x-[20px]", // .switch button[aria-checked='true'] span

  editor: {
    base: "flex-auto relative resize-y z-negative", // .editor
     // Assuming this is for the .editor-shell class
    image: {
      base: "inline-block relative cursor-default select-none", //.editor-shell span.editor-image
      img: {
        base: "max-w-full cursor-default", //.editor-shell .editor-image img
        focused: "outline outline-2 outline-blue-600", //.editor-shell .editor-image img.focused
        draggable: {
          base: "cursor-grab", // .editor-shell .editor-image img.focused.draggable
          active: "cursor-grabbing", //.editor-shell .editor-image img.focused.draggable:active
        },
      },
      captionContainer:
        "block absolute bottom-1 left-0 right-0 p-0 m-0 border-t border-white bg-opacity-90 bg-white min-w-[100px] text-black overflow-hidden", //editor-shell .editor-image .image-caption-container
      captionButton:
        "block absolute bottom-5 left-0 right-0 w-[30%] mx-auto p-2 border border-white/30 rounded bg-black bg-opacity-50 min-w-[100px] text-white cursor-pointer select-none hover:bg-blue-500", // .editor-shell .editor-image .image-caption-button,
      resizer: {
        base: "block w-[7px] h-[7px] absolute bg-blue-600 border border-white", // .editor-shell .editor-image .image-resizer
        n: "top-[-6px] left-[48%] cursor-n-resize", //.editor-shell .editor-image .image-resizer.image-resizer-n
        ne: "top-[-6px] right-[-6px] cursor-ne-resize", //.editor-shell .editor-image .image-resizer.image-resizer-ne
        e: "bottom-[48%] right-[-6px] cursor-e-resize", //.editor-shell .editor-image .image-resizer.image-resizer-e
        se: "bottom-[-2px] right-[-6px] cursor-nwse-resize", //.editor-shell .editor-image .image-resizer.image-resizer-se
        s: "bottom-[-2px] left-[48%] cursor-s-resize", //.editor-shell .editor-image .image-resizer.image-resizer-s
        sw: "bottom-[-2px] left-[-6px] cursor-sw-resize", //.editor-shell .editor-image .image-resizer.image-resizer-sw
        w: "bottom-[48%] left-[-6px] cursor-w-resize", //.editor-shell .editor-image .image-resizer.image-resizer-w
        nw: "top-[-6px] left-[-6px] cursor-nw-resize", //.editor-shell .editor-image .image-resizer.image-resizer-nw
      },
    },
    inlineImage: {
      base: "inline-block relative z-10 cursor-default select-none", // .editor-shell span.inline-editor-image
      img: {
        base: "cursor-default", //.editor-shell .inline-editor-image img
        focused: "outline outline-2 outline-blue-600", // .editor-shell .inline-editor-image img.focused
        draggable: {
          base: "cursor-grab", //.editor-shell .inline-editor-image img.focused.draggable
          active: "cursor-grabbing", //.editor-shell .inline-editor-image img.focused.draggable:active
        },
      },
      captionContainer:
        "block bg-gray-200 min-w-full text-black overflow-hidden", //.editor-shell .inline-editor-image .image-caption-container
      editButton: {
        base: "block absolute top-3 right-3 py-[6px] px-[8px] border border-white/30 rounded-md bg-black/50 min-w-[60px] text-white cursor-pointer select-none hover:bg-blue-500", //.editor-shell .inline-editor-image .image-edit-button
        hide: "hidden", // For .view-scroller .inline-editor-image .image-edit-button
      },
      position: {
        full: "my-4", //.editor-shell .inline-editor-image.position-full
        left: "float-left w-fit mx-1 mb-0", //.editor-shell .inline-editor-image.position-left
        right: "float-right w-fit mb-0 mx-1", //.editor-shell .inline-editor-image.position-right
      },
      resizer: {
        base: "block w-[7px] h-[7px] absolute bg-blue-600 border border-white", // .editor-shell .inline-editor-image .image-resizer
        n: "top-[-6px] left-[48%] cursor-n-resize", //  .editor-shell .inline-editor-image .image-resizer.image-resizer-n
        ne: "top-[-6px] right-[-6px] cursor-ne-resize", //.editor-shell .inline-editor-image .image-resizer.image-resizer-ne
        e: "bottom-[48%] right-[-6px] cursor-e-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-e
        se: "bottom-[-2px] right-[-6px] cursor-nwse-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-se
        s: "bottom-[-2px] left-[48%] cursor-s-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-s
        sw: "bottom-[-2px] left-[-6px] cursor-sw-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-sw
        w: "bottom-[48%] left-[-6px] cursor-w-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-w
        nw: "top-[-6px] left-[-6px] cursor-nw-resize", // .editor-shell .inline-editor-image .image-resizer.image-resizer-nw
      },
    },
  },
  keyword: "text-[#f1765e] font-bold", //keyword
  tableDisableCell: {
    disableSelection: {
      base: "",
      selectedSpan: "bg-transparent", //  table.disable-selection span::selection
      selectedBr: "bg-transparent", //table.disable-selection br::selection
    },
  },
  cellActionButtonContainer: "absolute top-0 left-0 will-change-transform", //table-cell-action-button-container
  cellActionButton:
    "bg-none flex justify-center items-center border-0 relative rounded-[15px] text-[#222] inline-block cursor-pointer", //.table-cell-action-button
  actionButton: {
    base: "bg-[#eee] border-0 px-3 py-2 relative ml-[5px] rounded-[15px] text-[#222] inline-block cursor-pointer hover:bg-[#ddd] hover:text-black", //.action-button
    disabled: "g-gray-200 cursor-not-allowed opacity-60", // button.action-button:disabled
  },
  typeaheadPopover: {
    base: "bg-white shadow-[0_5px_10px_rgba(0,0,0,0.3)] rounded-[8px] mt-[25px]", // .typeahead-popover
    ul: {
      base: "p-0 list-none m-0 rounded-[8px] max-h-[200px] overflow-y-scroll scrollbar-none", // .typeahead-popover ul
      li: {
        base: "m-0 min-w-[180px] text-[14px] outline-none cursor-pointer rounded-[8px] hover:bg-gray-200", // .typeahead-popover ul li
        selected: "bg-gray-200", // .typeahead-popover ul li.selected
        item: "p-[8px] text-[#050505] cursor-pointer leading-[16px] text-[15px] flex items-center shrink-0 rounded-[8px] border-0",
        active: "flex w-[20px] h-[20px] bg-contain", // .typeahead-popover li.active
        firstChild: "rounded-t-[8px]", // .typeahead-popover li:first-child
        lastChild: "rounded-b-[8px]", // .typeahead-popover li:last-child
        hover: "bg-gray-200", // .typeahead-popover li:hover
        text: "flex items-center leading-[20px] grow min-w-[150px]", // .typeahead-popover li .text
        icon: "flex w-[20px] h-[20px] select-none mr-[8px] leading-[16px] bg-contain bg-no-repeat bg-center", // .typeahead-popover li .icon
      },
    },
    li: 'm-0 mx-2 p-2 text-[#050505] cursor-pointer leading-4 text-[15px] flex items-center flex-row flex-shrink-0 bg-white rounded-lg border-0'
  },
  debugTimetravelPanel: {
    base: "overflow-hidden p-0 pb-2.5 m-auto flex", // .debug-timetravel-panel
    slider: "p-0 flex-[8]", // .debug-timetravel-panel-slider
    button: "p-0 border-0 bg-none flex-[1] text-white text-xs hover:underline", // .debug-timetravel-panel-button
  },
  debugTimetravelButton:
    "absolute top-2.5 right-3 border-0 p-0 text-xs text-white bg-transparent hover:underline", //.debug-timetravel-button
  debugTreetypeButton:
    "absolute top-2.5 right-[85px] border-0 p-0 text-xs text-white bg-transparent hover:underline", //.debug-treetype-button
  connecting:
    "absolute top-2.5 left-2.5 text-[15px] text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none", // .connecting
  toolbar: {
    base: "flex flex-wrap h-fit overflow-hidden mb[1px] p-1 rounded-tl-lg rounded-tr-lg sticky top-0 z-20 items-center", // .toolbar
    toolbarItem: {
      base: "border-0 flex bg-none rounded-lg p-2 cursor-pointer align-middle flex-shrink-0 items-center justify-between hover:bg-gray-200", // .toolbar .toolbar-item
      disabled: {
        base: "cursor-not-allowed", // .toolbar .toolbar-item:disabled
        icon: "opacity-20", // .toolbar .toolbar-item:disabled .icon,
        text: "opacity-20", // .toolbar .toolbar-item:disabled .text,
        iconFormat: "opacity-60", // .toolbar .toolbar-item:disabled i.format,
        chevronDown: "opacity-20", // .toolbar .toolbar-item:disabled .chevron-down
      },
      spaced: "mr-2", // .toolbar .toolbar-item.spaced
      iconFormat: "flex h-[18px] w-[18px] opacity-60 custom-vertical-align", // .toolbar .toolbar-item i.format
      active: {
        base: "bg-[rgba(223,232,250,0.3)]", // .toolbar .toolbar-item.active
        i: "opacity-100", //.toolbar .toolbar-item.active i
      },
      fontFamilyText: "block max-w-[10rem]", // .toolbar .toolbar-item.font-family .text
      text: "flex leading-[20px] custom-vertical-align text-[14px] text-gray-500 truncate overflow-hidden h-[20px] text-left pr-[10px]", // .toolbar .toolbar-item .text
      icon: "flex w-5 h-5 select-none mr-2 leading-4 bg-contain", // .toolbar .toolbar-item .icon
    },
    codeLanguage: "w-[150px]", // .toolbar .code-language
    chevronDownIcon: "mt-1 w-4 h-4 flex select-none", // .toolbar i.chevron-down
    chevronDownIconInside: "w-4 h-4 flex ml-6 mt-2.5 mr-2 pointer-events-none", //.toolbar i.chevron-down.inside
    divider: "w-[1px] bg-[#eee] mx-[4px] h-[35px]", // .toolbar .divider
  },
  stickyNoteContainer: {
    base: "absolute z-9 w-[120px] inline-block", //.sticky-note-container
    dragging: "transition-none", // .sticky-note-container.dragging
  },
  stickyNote: {
    base: "relative block cursor-move text-left w-[120px] m-6 p-[20px] border border-[#e8e8e8] font-[Reenie_Beanie] text-[24px] rounded-br-[60px]", //.sticky-note
    contentEditable:
      "min-h-[20px] border-0 resize-none cursor-text text-[24px] caret-black block relative tab-[1] outline-none p-[10px] select-text whitespace-pre-wrap break-words", // .StickyNode__contentEditable
    placeholder:
      "text-[24px] text-gray-500 overflow-hidden absolute truncate top-[30px] left-[20px] w-[120px] select-none whitespace-nowrap inline-block pointer-events-none", // .StickyNode__placeholder
    after:
      "absolute z-[-1] right-0 bottom-[20px] w-[120px] h-[25px] bg-black/20 shadow-[2px_15px_5px_rgba(0,0,0,0.4)] transform -scale-x-100", // .sticky-note:after
    yellow:
      "border-t border-[#fdfd86] bg-gradient-to-br from-[#ffff88] to-[#ffffc6]", //.sticky-note.yellow
    pink: "border-t border-[#e7d1e4] bg-gradient-to-br from-[#f7cbe8] to-[#e7bfe1]", //.sticky-note.pink
    div: "cursor-text", // .sticky-note div
    delete:
      "absolute top-[8px] right-[10px] text-[10px] border-0 bg-none cursor-pointer opacity-50 hover:font-bold hover:opacity-100", //.sticky-note .delete
    color:
      "absolute top-[8px] right-[25px] border-0 bg-none opacity-50 hover:opacity-100", //.sticky-note .color,
    colorIcon: "block w-[12px] h-[12px] bg-contain", //.sticky-note .color i
  },
  excalidrawButton: {
    base: "border-0 p-0 m-0 bg-transparent", // .excalidraw-button
    selected: "outline outline-2 outline-[rgb(60,132,244)] user-select-none", // .excalidraw-button.selected
  },
  hr: {
    base: "p-[2px] border-none my-4 cursor-pointer relative", // hr
    after: "absolute left-0 right-0 h-[2px] bg-[#ccc] leading-[2px]", // hr:after
    selected: "outline-[2px] outline-solid outline-[#3c84f4] select-none", // hr.selected
  },
  spacer: "tracking[-2px]", // .spacer
  editorEquation: {
    base: "cursor-default select-none", //.editor-equation
    focused: "outline-2 outline-solid outline-[#3c84f4]", // .editor-equation.focused
  },
  buttonItemIcon: "opacity-60", // button.item i
  dropdownItemActive: "bg-[#dfe8fa4d]", // button.item.dropdown-item-active
  dropdownItemActiveIcon: "opacity-100", // button.item.dropdown-item-active i
  tableNodeContentEditable:
    "min-h-[20px] border-0 resize-none cursor-text block relative tab-size-1 outline-0 p-0 select-text text-[15px] whitespace-pre-wrap break-words z-3", //.TableNode__contentEditable
  nestable: {
    base: "relative", // .nestable
    list: "p-0 list-none", // .nestable .nestable-list
    listDirectChild: "p-0", // .nestable > .nestable-list
    item: "m-0", // .nestable-item, .nestable-item-copy
    itemFirstChild: "mt-0", // .nestable-item:first-child, .nestable-item-copy:first-child
    itemList: "mt-0", // .nestable-item .nestable-list, .nestable-item-copy .nestable-list
    isDragging: {
      list: "pointer-events-none", // .nestable-item.is-dragging .nestable-list
      allElements: "opacity-0", // .nestable-item.is-dragging *
      before: "absolute inset-0 rounded-md", // .nestable-item.is-dragging:before
    },
    itemIcon: "mr-1 cursor-pointer", // .nestable-item-icon
    dragLayer: "fixed top-0 left-0 z-[100] pointer-events-none", // .nestable-drag-layer
    dragLayerList: "absolute top-0 left-0 p-0", // .nestable-drag-layer > .nestable-list
    icon: {
      base: "relative inline-block w-5 h-5 bg-transparent bg-center bg-no-repeat", // .nestable-icon
      before: "hidden", // .nestable-icon:before
    },
    iconPlusGray: 'w-5 h-5 bg-[url("./icon-plus-gray.svg")]', // .icon-plus-gray
    iconMinusGray: 'w-5 h-5 bg-[url("./icon-minus-gray.svg")]', // .icon-minus-gray
  },
  draggableBlockMenu: {
    base: "rounded-md p-0.5 cursor-grab opacity-0 absolute -left-0 top-0 will-change-transform hover:bg-gray-200", // .draggable-block-menu
    icon: "w-4 h-4 opacity-30 bg-[url(/images/icons/draggable-block-menu.svg)]", // .draggable-block-menu .icon
    active: "cursor-grabbing", // .draggable-block-menu:active
  },
  draggableBlockTargetLine: {
    base: "pointer-events-none bg-deepskyblue h-1 absolute left-0 top-0 opacity-0 will-change-transform", // .draggable-block-target-line
  },
  floatingTextFormatPopup: {
    base: "flex bg-white p-1 align-middle absolute top-0 left-0 z-10 opacity-0 shadow-md rounded-lg transition-opacity duration-500 h-11 will-change-transform", // .floating-text-format-popup
    popupItem: {
      base: "border-0 flex bg-transparent rounded-lg p-2 cursor-pointer align-middle", // .floating-text-format-popup button.popup-item
      disabled: "cursor-not-allowed", // .floating-text-format-popup button.popup-item:disabled
      spaced: "mr-[2px]", // .floating-text-format-popup button.popup-item.spaced
      icon: "bg-contain inline-block h-[18px] w-[18px] mt-[2px] flex opacity-60", // .floating-text-format-popup button.popup-item i.format
      disabledIcon: "opacity-20", // .floating-text-format-popup button.popup-item:disabled i.format
      active: "bg-[rgba(223,232,250,0.3)]", // .floating-text-format-popup button.popup-item.active
      activeIcon: "opacity-100", // .floating-text-format-popup button.popup-item.active i
      hover: "hover:bg-gray-200", // .floating-text-format-popup .popup-item:hover:not([disabled])
    },
    select: {
      base: "border-0 flex bg-transparent rounded-lg p-2 w-18 text-sm text-gray-500 truncate appearance-none", // .floating-text-format-popup select.popup-item
      codeLanguage: "capitalize w-32",
    },
    text: "flex items-center text-[14px] text-gray-500 leading-[20px] w-[70px] h-[20px] overflow-hidden text-left truncate", // .floating-text-format-popup .popup-item .text
    icon: "flex w-5 h-5 select-none mr-2 leading-4 bg-contain", // .floating-text-format-popup .popup-item .icon
    chevronDown: "mt-0.75 w-4 h-4 flex select-none", // .floating-text-format-popup i.chevron-down
    chevronInside:
      "w-4 h-4 flex ml-[-6.25rem] mt-[11px] mr-[10px] pointer-events-none", // .floating-text-format-popup i.chevron-down.inside
    divider: "w-px bg-gray-200 mx-1", // .floating-text-format-popup .divider
    insertComment: "hidden md:block",
  },
  collapsible: {
    container: "bg-[#fcfcfc] border border-gray-200 rounded-lg mb-2", // .Collapsible__container
    containerOpen: "bg-transparent border-none", // .Collapsible__container[open]
    title:
      "scroll-mt-24 cursor-pointer p-1.25 pl-5 relative font-bold list-none outline-none", // .Collapsible__title
    titleBefore:
      "absolute left-1.75 top-1/2 transform -translate-y-1/2 border border-solid border-transparent border-l-black border-t-[4px] border-b-[4px] border-l-[6px] border-r-[6px]", // .Collapsible__title:before
    titleBeforeClosed: "border-[0.25rem_0.375rem_0.25rem_0.375rem]", // .Collapsible__container[open] .Collapsible__title:before
    titleBeforeOpen:
      "border-[0.375rem_0.25rem_0_0.25rem] border-t-black bg-transparent", // .Collapsible__container[open]
    content: "p-0 pl-5 pb-[5px]", // .Collapsible__content
    collapsedContent: "hidden select-none", // .Collapsible__collapsed .Collapsible__content
  },
  tableOfContents: {
    container:
      "fixed top-52 right-[-35px] p-[10px] w-[250px] flex flex-row justify-start z-10 h-[300px] text-[#65676b]", // .table-of-contents
    headings:
      "list-none mt-0 ml-[10px] p-0 overflow-scroll w-[200px] h-[220px] overflow-x-hidden overflow-y-auto scrollbar-hide", // .headings
    heading1: "text-black font-bold cursor-pointer", // .first-heading
    heading2: "ml-[10px]", // .table-of-contents .heading2
    heading3: "ml-5", // .table-of-contents .heading3
    normalHeading: "cursor-pointer leading-5 text-base",
    selectedHeading: "text-[#3578e5] relative", // .selected-heading
    selectedHeadingWrapper: "relative",
    selectedHeadingBefore:
      "absolute inline-block left-[-30px] top-1 z-10 h-1 w-1 bg-[#3578e5] border-4 border-white rounded-full", // .selected-heading-wrapper::before
    normalHeadingWrapper: "ml-8 relative", // .normal-heading
  },
  // tableCellResizer: {
  //   resizer: "absolute", // .TableCellResizer__resizer
  // },
  imageNode: {
    contentEditable:
      "min-h-[20px] border-0 resize-none cursor-text caret-[#050505] block relative tab-[1] outline-0 p-[10px] select-text text-[12px] w-[calc(100%-20px)] whitespace-pre-wrap break-words", // .ImageNode__contentEditable
    placeholder:
      "text-[12px] text-gray-500 overflow-hidden absolute text-ellipsis top-[10px] left-[10px] select-none whitespace-nowrap inline-block pointer-events-none", // .ImageNode__placeholder
  },
  imageControlWrapperResizing: "touch-none", // image-control-wrapper--resizing
  actions: {
    base: "absolute text-right m-[10px] bottom-0 right-0", // .actions
    treeView: "rounded-bl-none rounded-br-none", // .actions.tree-view
    i: {
      base: "bg-contain inline-block h-[15px] w-[15px] align-[-0.25em]", // .actions i
      indent: "bg-[url(/images/icons/indent.svg)]",
      outdent: "bg-[url(/images/icons/outdent.svg)]",
      lock: "bg-[url(/images/icons/lock-fill.svg)]",
      unlock: "bg-[url(/images/icons/lock.svg)]",
      image: "bg-[url(/images/icons/file-image.svg)]",
      table: "bg-[url(/images/icons/table.svg)]",
      leftAlign: "bg-[url(/images/icons/text-left.svg)]",
      centerAlign: "bg-[url(/images/icons/text-center.svg)]",
      rightAlign: "bg-[url(/images/icons/text-right.svg)]",
      justifyAlign: "bg-[url(/images/icons/justify.svg)]",
      disconnect: "bg-[url(/images/icons/plug.svg)]",
      connect: "bg-[url(/images/icons/plug-fill.svg)]",
    },
  },
};

export default theme;
