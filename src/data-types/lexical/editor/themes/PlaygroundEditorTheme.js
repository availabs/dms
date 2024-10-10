/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import "./PlaygroundEditorTheme.css";

const theme = {
  blockCursor: `block pointer-events-none absolute content-['']  after:absolute after:-top-[2px] after:w-[20px] after:border-t-[1px_solid_black]`,
  characterLimit: "inline !bg-[#ffbbbb]",
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
  heading: {
    h1: "font-semibold text-2xl scroll-mt-36 font-display", //'PlaygroundEditorTheme__h1',
    h2: "font-medium text-xl scroll-mt-36 font-display", //'PlaygroundEditorTheme__h2',
    h3: "font-medium text-lg scroll-mt-36 font-display", //'PlaygroundEditorTheme__h3',
    h4: "font-medium scroll-mt-36 font-display", //'PlaygroundEditorTheme__h4',
    h5: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h5',
    h6: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h6',
  },
  code: "bg-[rgb(240,242,245)] font-[Menlo,_Consolas,_Monaco,_monospace] block p-[8px] pl-[52px] leading-[1.53] text-[13px] m-0 mt-[8px] mb-[8px] [tab-size:2] relative overflow-x-auto before:content-[attr(data-gutter)] before:absolute before:bg-[#eee] before:left-0 before:top-0 before:border-r before:border-solid before:border-[#ccc] before:p-[8px] before:text-[#777] before:whitespace-pre-wrap before:min-w-[25px] before:text-right", //PlaygroundEditorTheme__code
  image: "editor-image",
  indent: "PlaygroundEditorTheme__indent",
  inlineImage: "inline-editor-image",
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
  paragraph: "m-0 relative", //'PlaygroundEditorTheme__paragraph',
  quote:
    "m-0 ml-5 mb-2 text-[15px] text-[rgb(101,103,107)] border-l-4 border-l-[rgb(206,208,212)] pl-4", //'PlaygroundEditorTheme__quote',
  rtl: "text-right", //'PlaygroundEditorTheme__rtl',
  table:
    "border-collapse border-spacing-0 max-w-full overflow-y-scroll table-fixed w-[calc(100%-25px)] my-7", //'PlaygroundEditorTheme__table',
  tableAddColumns:
    "relative top-0 w-[20px] bg-gray-200 h-full right-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url('../images/icons/plus.svg')] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40", //'PlaygroundEditorTheme__tableAddColumns',
  tableAddRows:
    "absolute bottom-[-25px] w-[calc(100%-25px)] bg-gray-200 h-[20px] left-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url('../images/icons/plus.svg')] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40", //'PlaygroundEditorTheme__tableAddRows',
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
  text: {
    bold: "font-bold", //'PlaygroundEditorTheme__textBold',
    code: "bg-gray-200 px-1 py-0.5 font-mono text-[94%]", //'PlaygroundEditorTheme__textCode',
    italic: "italic", //'PlaygroundEditorTheme__textItalic',
    strikethrough: "line-through", //'PlaygroundEditorTheme__textStrikethrough',
    subscript: "align-sub text-[0.8em]", //'PlaygroundEditorTheme__textSubscript',
    superscript: "align-super text-[0.8em]", //'PlaygroundEditorTheme__textSuperscript',
    underline: "underline", //'PlaygroundEditorTheme__textUnderline',
    underlineStrikethrough: "underline line-through", //'PlaygroundEditorTheme__textUnderlineStrikethrough',
  },

  // lexical stuff
  // shell: {
  //   editorShell: 'mx-auto my-0 rounded-[2px] relative', //'.editor-shell',
  //   editorContainer: 'relative block rounded-[10px] min-h-[50px]', //'.editor-shell .editor-container'
  // },
  editorScroller:
    "min-h-[150px] border-0 flex relative outline-0 z-0 overflow-auto resize-y", //'editor-scroller'
  viewScroller:
    "border-0 flex relative outline-0 z-0 overflow-auto resize-none", //view-scroller
  editor: "flex-auto relative resize-y z-negative", //editor
  testRecorderOutput: "my-5 mx-auto w-full", //test-recorder-output
  treeViewOutput:
    "block bg-gray-900 text-white p-0 text-xs my-[1px] mx-auto mb-2.5 relative overflow-hidden rounded-lg", //tree-view-output
  editorDevButton: {
    base: "relative block w-10 h-10 text-xs rounded-[20px] border-none cursor-pointer outline-none shadow-[0px_1px_10px_rgba(0,0,0,0.3)] bg-gray-700 hover:bg-gray-600 after:content-[''] after:absolute after:top-[10px] after:right-[10px] after:bottom-[10px] after:left-[10px] after:block after:bg-contain after:filter invert", //editor-dev-button
    active: "bg-red-600", //editor-dev-button .active
  },
  testRecorderToolbar: "flex", //test-recorder-toolbar
  testRecorderButton: {
    base: "relative block w-8 h-8 text-xs p-1.5 rounded-md border-none cursor-pointer outline-none shadow-md bg-gray-800 transition-shadow duration-75 ease-out after:content-[''] after:absolute after:top-2 after:right-2 after:bottom-2 after:left-2 after:block after:bg-contain after:filter-invert", //test-recorder-button
    active: "shadow-lg", //test-recorder-button .active
  },
  componentPickerMenu: "w[200px]", //component-picker-menu
  mentionsMenu: "w[250px]", // mentions-menu
  autoEmbedMenu: "w[150px]", //auto-embed-menu
  emojiMenu: "w[200px]", //emoji-menu

  i: {
    palette: "bg-[url(images/icons/palette.svg)]",
    bucket: "bg-[url(images/icons/paint-bucket.svg)]",
    bold: "bg-[url(images/icons/type-bold.svg)]",
    italic: "bg-[url(images/icons/type-italic.svg)]",
    clear: "bg-[url(images/icons/trash.svg)]",
    code: "bg-[url(images/icons/code.svg)]",
    underline: "bg-[url(images/icons/type-underline.svg)]",
    strikethrough: "bg-[url(images/icons/type-strikethrough.svg)]",
    subscript: "bg-[url(images/icons/type-subscript.svg)]",
    superscript: "bg-[url(images/icons/type-superscript.svg)]",
    link: "bg-[url(images/icons/link.svg)]",
    horizontalRule: "bg-[url(images/icons/horizontal-rule.svg)]",
    centerAlign: "bg-[url(images/icons/text-center.svg)]",
    rightAlign: "bg-[url(images/icons/text-right.svg)]",
    justifyAlign: "bg-[url(images/icons/justify.svg)]",
    indent: "bg-[url(images/icons/indent.svg)]",
    markdown: "bg-[url(images/icons/markdown.svg)]",
    outdent: "bg-[url(images/icons/outdent.svg)]",
    undo: "bg-[url(images/icons/arrow-counterclockwise.svg)]",
    redo: "bg-[url(images/icons/arrow-clockwise.svg)]",
    sticky: "bg-[url(images/icons/sticky.svg)]",
    mic: "bg-[url(images/icons/mic.svg)]",
    import: "bg-[url(images/icons/upload.svg)]",
    export: "bg-[url(images/icons/download.svg)]",
    diagram2: "bg-[url(images/icons/diagram-2.svg)]",
    user: "bg-[url(images/icons/user.svg)]",
    equation: "bg-[url(images/icons/plus-slash-minus.svg)]",
    gif: "bg-[url(images/icons/filetype-gif.svg)]",
    copy: "bg-[url(images/icons/copy.svg)]",
    success: "bg-[url(images/icons/success.svg)]",
    prettier: "bg-[url(images/icons/prettier.svg)]",
    prettierError: "bg-[url(images/icons/prettier-error.svg)]",
  },
  icon: {
    plus: "bg-[url(images/icons/plus.svg)]",
    caretRight: "bg-[url(images/icons/caret-right-fill.svg)]",
    dropdownMore: "bg-[url(images/icons/dropdown-more.svg)]",
    fontColor: "bg-[url(images/icons/font-color.svg)]",
    fontFamily: "bg-[url(images/icons/font-family.svg)]",
    bgColor: "bg-[url(images/icons/bg-color.svg)]",
    table:
      "bg-[#6c757d] mask-[url(images/icons/table.svg)] mask-no-repeat mask-size-contain",
    paragraph: "bg-[url(images/icons/text-paragraph.svg)]",
    h1: "bg-[url(images/icons/type-h1.svg)]",
    h2: "bg-[url(images/icons/type-h2.svg)]",
    h3: "bg-[url(images/icons/type-h3.svg)]",
    h4: "bg-[url(images/icons/type-h4.svg)]",
    h5: "bg-[url(images/icons/type-h5.svg)]",
    h6: "bg-[url(images/icons/type-h6.svg)]",
    bulletList: "bg-[url(images/icons/list-ul.svg)]",
    bullet: "bg-[url(images/icons/list-ul.svg)]", // Repeated for .icon.bullet
    checkList: "bg-[url(images/icons/square-check.svg)]",
    check: "bg-[url(images/icons/square-check.svg)]", // Repeated for .icon.check
    numberedList: "bg-[url(images/icons/list-ol.svg)]",
    number: "bg-[url(images/icons/list-ol.svg)]", // Repeated for .icon.number
    quote: "bg-[url(images/icons/chat-square-quote.svg)]",
    code: "bg-[url(images/icons/code.svg)]",
  },
  switch: {
    base: "block text-gray-700 my-1.5 bg-gray-200 bg-opacity-70 py-1 px-2.5 rounded-lg", // switch
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
    button: {
      active: "bg-[rgb(223,232,250)]", // .link-editor .button.active
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
        "bg-[url(images/icons/pencil-fill.svg)] bg-cover w-[35px] align-middle absolute right-[30px] top-0 bottom-0 cursor-pointer", //.link-editor div.link-edit
      linkTrash:
        "bg-[url(images/icons/trash.svg)] bg-cover w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer", //.link-editor div.link-trash
      linkCancel:
        "bg-[url(images/icons/close.svg)] bg-cover w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[28px]", //.link-editor div.link-cancel
      linkConfirm:
        "bg-[url(images/icons/success-alt.svg)] bg-cover w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[2px]", //link-editor div.link-confirm
    },
    fontSizeWrapper: "flex mx-[4px]", // .link-editor .font-size-wrapper,
    fontFamilyWrapper: "flex mx-[4px]", // .link-editor .font-family-wrapper
    select: "p-[6px] border-0 bg-[rgba(0,0,0,0.075)] rounded-[4px]", // .link-editor select
  },
  mention: {
    focus: 'shadow-[0_0_0_2px_rgb(180,213,255)] outline-none', //.mention:focus
  },
  blockControls: {
    base: 'absolute right-2 top-4 w-8 h-8 box-border shadow-md z-10 rounded-lg border border-gray-300 overflow-hidden', // #block-controls
    button: {
      base: 'border border-white bg-white block transition-colors duration-100 ease-in cursor-pointer outline-none rounded-lg p-1 hover:bg-gray-200', // #block-controls button
      focusVisible: 'focus-visible:border-blue-500', // #block-controls button:focus-visible
    },
    span: {
      base: 'block w-4.5 h-4.5 m-0.5 bg-contain', // #block-controls span.block-type
      paragraph: 'bg-[url(images/icons/text-paragraph.svg)]', // #block-controls span.block-type.paragraph
      h1: 'bg-[url(images/icons/type-h1.svg)]', // #block-controls span.block-type.h1
      h2: 'bg-[url(images/icons/type-h2.svg)]', // #block-controls span.block-type.h2
      quote: 'bg-[url(images/icons/chat-square-quote.svg)]', //#block-controls span.block-type.quote
      ul: 'bg-[url(images/icons/list-ul.svg)]', //#block-controls span.block-type.ul
      ol: 'bg-[url(images/icons/list-ol.svg)]', //#block-controls span.block-type.ol
      code: 'bg-[url(images/icons/code.svg)]', //#block-controls span.block-type.code
    },
  },
  charactersLimit: {
    base: 'text-gray-400 text-xs text-right block absolute left-3 bottom-1', // .characters-limit
    exceeded: 'text-red-500', // .characters-limit.characters-limit-exceeded
  },
  dropdown: {
    base: 'z-10 block fixed shadow-lg rounded-lg min-h-[40px] bg-white', // .dropdown
    item: {
      base: 'mx-2 my-0 px-2 text-gray-900 cursor-pointer leading-4 text-base flex flex-row justify-between bg-white rounded-lg border-0 max-w-[250px] min-w-[100px] hover:bg-gray-200', //.dropdown .item
      fontSizeItem: 'min-w-unset', //.dropdown .item.fontsize-item
      fontSizeText: 'min-w-unset', // .dropdown .item.fontsize-item .text 
      active: 'flex w-5 h-5 bg-contain', // .dropdown .item .active
      firstChild: 'mt-2', // .dropdown .item:first-child
      lastChild: 'mb-2', // .dropdown .item:last-child
      text: 'flex leading-5 flex-grow min-w-[150px]', //.dropdown .item .text
      icon: 'flex w-5 h-5 select-none mr-3 leading-4 bg-contain bg-center bg-no-repeat', // .dropdown .item .icon
    },
    divider: 'w-auto bg-gray-200 my-1 h-[1px] mx-2', // .dropdown .divider
  },
  switch: {
    base: 'block text-gray-700 my-1 bg-[rgba(238,_238,_238,_0.7)] p-1 px-2.5 rounded-lg', //.switch
    label: 'mr-1 leading-6 w-[100px] text-sm inline-block align-middle', // .switch label
    button: 'bg-gray-300 h-[24px] box-border rounded-full w-[44px] inline-block align-middle relative outline-none cursor-pointer transition-colors duration-100 border-2 border-transparent', //.switch button
    buttonFocus: 'focus-visible:border-blue-500', // .switch button:focus-visible
    buttonSpan: 'absolute top-0 left-0 block w-[20px] h-[20px] rounded-full bg-white transition-transform duration-200', //.switch button span
    buttonChecked: 'bg-blue-600', // .switch button[aria-checked='true']
    buttonCheckedSpan: 'translate-x-[20px]', // .switch button[aria-checked='true'] span
  },
  editor: {
    shell: 'relative', // Assuming this is for the .editor-shell class
    image: {
      base: 'inline-block relative cursor-default select-none', //.editor-shell span.editor-image
      img: {
        base: 'max-w-full cursor-default', //.editor-shell .editor-image img
        focused: 'outline outline-2 outline-blue-600', //.editor-shell .editor-image img.focused
        draggable: {
          base: 'cursor-grab', // .editor-shell .editor-image img.focused.draggable
          active: 'cursor-grabbing', //.editor-shell .editor-image img.focused.draggable:active
        },
      },
      captionContainer: 'block absolute bottom-1 left-0 right-0 p-0 m-0 border-t border-white bg-opacity-90 bg-white min-w-[100px] text-black overflow-hidden', //editor-shell .editor-image .image-caption-container
      captionButton: 'block absolute bottom-5 left-0 right-0 w-[30%] mx-auto p-2 border border-white/30 rounded bg-black bg-opacity-50 min-w-[100px] text-white cursor-pointer select-none hover:bg-blue-500', // .editor-shell .editor-image .image-caption-button,
      resizer: {
        base: 'block w-[7px] h-[7px] absolute bg-blue-600 border border-white', // .editor-shell .editor-image .image-resizer
        n: 'top-[-6px] left-[48%] cursor-n-resize', //.editor-shell .editor-image .image-resizer.image-resizer-n
        ne: 'top-[-6px] right-[-6px] cursor-ne-resize', //.editor-shell .editor-image .image-resizer.image-resizer-ne
        e: 'bottom-[48%] right-[-6px] cursor-e-resize',        //.editor-shell .editor-image .image-resizer.image-resizer-e 
        se: 'bottom-[-2px] right-[-6px] cursor-nwse-resize', //.editor-shell .editor-image .image-resizer.image-resizer-se 
        s: 'bottom-[-2px] left-[48%] cursor-s-resize', //.editor-shell .editor-image .image-resizer.image-resizer-s 
        sw: 'bottom-[-2px] left-[-6px] cursor-sw-resize', //.editor-shell .editor-image .image-resizer.image-resizer-sw 
        w: 'bottom-[48%] left-[-6px] cursor-w-resize', //.editor-shell .editor-image .image-resizer.image-resizer-w 
        nw: 'top-[-6px] left-[-6px] cursor-nw-resize', //.editor-shell .editor-image .image-resizer.image-resizer-nw 
      },
    },
    inlineImage: {
      base: 'inline-block relative z-10 cursor-default select-none', // .editor-shell span.inline-editor-image
      img: {
        base: 'cursor-default', //.editor-shell .inline-editor-image img
        focused: 'outline outline-2 outline-blue-600', // .editor-shell .inline-editor-image img.focused
        draggable: {
          base: 'cursor-grab', //.editor-shell .inline-editor-image img.focused.draggable
          active: 'cursor-grabbing', //.editor-shell .inline-editor-image img.focused.draggable:active
        },
      },
      captionContainer: 'block bg-gray-200 min-w-full text-black overflow-hidden', //.editor-shell .inline-editor-image .image-caption-container
      editButton: {
        base: 'block absolute top-3 right-3 p-1.5 border border-white/30 rounded bg-black bg-opacity-50 min-w-[60px] text-white cursor-pointer select-none hover:bg-blue-500', //.editor-shell .inline-editor-image .image-edit-button
        hide: 'hidden', // For .view-scroller .inline-editor-image .image-edit-button
      },
      position: {
        full: 'my-4',                       //.editor-shell .inline-editor-image.position-full
        left: 'float-left w-fit mx-1 mb-0',//.editor-shell .inline-editor-image.position-left
        right: 'float-right w-fit mb-0 mx-1',//.editor-shell .inline-editor-image.position-right
      },
      resizer: {
        base: 'block w-[7px] h-[7px] absolute bg-blue-600 border border-white', // .editor-shell .inline-editor-image .image-resizer 
        n: 'top-[-6px] left-[48%] cursor-n-resize', //  .editor-shell .inline-editor-image .image-resizer.image-resizer-n
        ne: 'top-[-6px] right-[-6px] cursor-ne-resize', //.editor-shell .inline-editor-image .image-resizer.image-resizer-ne 
        e: 'bottom-[48%] right-[-6px] cursor-e-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-e
        se: 'bottom-[-2px] right-[-6px] cursor-nwse-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-se
        s: 'bottom-[-2px] left-[48%] cursor-s-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-s
        sw: 'bottom-[-2px] left-[-6px] cursor-sw-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-sw
        w: 'bottom-[48%] left-[-6px] cursor-w-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-w
        nw: 'top-[-6px] left-[-6px] cursor-nw-resize', // .editor-shell .inline-editor-image .image-resizer.image-resizer-nw
      },
    },
  },
  keyword: 'text-[#f1765e] font-bold', //keyword
  
};

export default theme;
