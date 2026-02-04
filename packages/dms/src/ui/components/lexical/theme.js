/**
 * Lexical Theme - Flat Key Structure
 *
 * This theme flattens the nested PlaygroundEditorTheme structure into flat keys
 * for integration with the DMS ThemeContext system. The buildLexicalInternalTheme()
 * function converts flat keys back to nested format for LexicalComposer.
 *
 * Key naming convention:
 *   nested.path.key -> nested_path_key
 *   e.g. heading.h1 -> heading_h1
 *        toolbar.toolbarItem.base -> toolbar_toolbarItem_base
 */

export const lexicalTheme = {
  options: { activeStyle: 0 },
  styles: [{
    name: "default",

    // Top-level editor styles
    editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0 resize-y",
    viewScroller: "border-0 flex relative outline-0 z-0 resize-none",
    editorContainer: "relative block rounded-[10px] min-h-[50px]",
    editorShell: "font-['Proxima_Nova'] font-[400] text-[1rem] text-slate-700 leading-[22.4px]",
    card: 'overflow-hidden p-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]',
    paragraph: "-ml-8 pl-8 relative",
    contentEditable: 'border-none relative [tab-size:1] outline-none outline-0',
    quote: "m-0 mb-2 font-['Oswald'] text-[30px] leading-[36px] text-[#2D3E4C] border-l-4 border-[#37576B] pl-4 pb-[12px]",

    // Headings (flat)
    heading_h1: "font-semibold text-3xl scroll-mt-36 font-display",
    heading_h2: "font-medium text-xl scroll-mt-36 font-display",
    heading_h3: "font-medium text-lg scroll-mt-36 font-display",
    heading_h4: "font-medium scroll-mt-36 font-display",
    heading_h5: "scroll-mt-36 font-display",
    heading_h6: "scroll-mt-36 font-display",

    // Text formatting (flat)
    text_bold: "font-[700]",
    text_code: "bg-gray-200 px-1 py-0.5 font-mono text-[94%]",
    text_italic: "italic",
    text_strikethrough: "line-through",
    text_subscript: "align-sub text-[0.8em]",
    text_superscript: "align-super text-[0.8em]",
    text_underline: "underline",
    text_underlineStrikethrough: "underline line-through",

    // Block cursor
    blockCursor: `block pointer-events-none absolute content-[''] after:absolute after:-top-[2px] after:w-[20px] after:border-t-[1px_solid_black]`,
    characterLimit: "inline !bg-[#ffbbbb]",
    layoutContainer: 'grid gap-[10px]',
    layoutItem: 'border border-dashed border-slate-300 rounded-lg px-2 py-4 min-w-0 max-w-full',

    // Code block
    code: `bg-[rgb(240,_242,_245)] font-[Menlo,_Consolas,_Monaco,_monospace] block pl-[52px] pr-[8px] py-[8px] leading-[1.53] text-[13px] m-0 mt-[8px] mb-[8px] [tab-size:2] relative after:content-[attr(data-gutter)] after:absolute after:bg-[#eee] after:left-[0] after:top-[0] after:border-r-[1px_solid_#ccc] after:p-[8px] after:text-[#777] after:whitespace-pre-wrap after:text-right after:min-w-[25px]`,

    // Code highlight (flat)
    codeHighlight_atrule: "text-[#07a]",
    codeHighlight_attr: "text-[#07a]",
    codeHighlight_boolean: "text-[#905]",
    codeHighlight_builtin: "text-[#690]",
    codeHighlight_cdata: "text-[slategray]",
    codeHighlight_char: "text-[#690]",
    codeHighlight_class: "text-[#dd4a68]",
    codeHighlight_className: "text-[#dd4a68]",
    codeHighlight_comment: "text-[slategray]",
    codeHighlight_constant: "text-[#905]",
    codeHighlight_deleted: "text-[#905]",
    codeHighlight_doctype: "text-[slategray]",
    codeHighlight_entity: "text-[#9a6e3a]",
    codeHighlight_function: "text-[#dd4a68]",
    codeHighlight_important: "text-[#e90]",
    codeHighlight_inserted: "text-[#690]",
    codeHighlight_keyword: "text-[#07a]",
    codeHighlight_namespace: "text-[#e90]",
    codeHighlight_number: "text-[#905]",
    codeHighlight_operator: "text-[#9a6e3a]",
    codeHighlight_prolog: "text-[slategray]",
    codeHighlight_property: "text-[#905]",
    codeHighlight_punctuation: "text-[#999]",
    codeHighlight_regex: "text-[#e90]",
    codeHighlight_selector: "text-[#690]",
    codeHighlight_string: "text-[#690]",
    codeHighlight_symbol: "text-[#905]",
    codeHighlight_tag: "text-[#905]",
    codeHighlight_url: "text-[#9a6e3a]",
    codeHighlight_variable: "text-[#e90]",

    // Embed block (flat)
    embedBlock_base: "select-none",
    embedBlock_focus: "outline-[2px_solid_rgb(60,_132,_244)]",

    hashtag: "bg-[rgba(88,_144,_255,_0.15)] border-b-[1px_solid_rgba(88,_144,_255,_0.3)]",
    image: "editor-image",
    indent: "PlaygroundEditorTheme__indent",
    inlineImage: "inline-editor-image",
    link: "text-[rgb(33,111,219)] no-underline inline-block hover:underline hover:cursor-pointer",

    // List (flat)
    list_listitem: "mx-[32px]",
    list_listitemChecked: "PlaygroundEditorTheme__listItemChecked",
    list_listitemUnchecked: "PlaygroundEditorTheme__listItemUnchecked",
    list_nested_listitem: "list-none before:hidden after:hidden",
    list_olDepth_0: "list-inside list-decimal m-0 p-0",
    list_olDepth_1: "m-0 p-0 list-inside list-alpha",
    list_olDepth_2: "m-0 p-0 list-inside list-lower-alpha",
    list_olDepth_3: "m-0 p-0 list-inside list-upper-roman",
    list_olDepth_4: "m-0 p-0 list-inside list-lower-roman",
    list_ul: "m-0 p-0 list-inside list-disc",

    // Token (flat)
    token_comment: "text-slate-500",
    token_punctuation: "text-gray-400",
    token_property: "text-[#905]",
    token_selector: "text-[#690]",
    token_operator: "text-[#9a6e3a]",
    token_attr: "text-[#07a]",
    token_variable: "text-[#e90]",
    token_function: "text-[#dd4a68]",

    ltr: "text-left",

    // Mark (flat)
    mark_base: "bg-[rgba(255, 212, 0, 0.14)] border-b-2 border-[rgba(255, 212, 0, 0.3)] pb-0.5",
    mark_selected: "bg-[rgba(255, 212, 0, 0.5)] border-b-2 border-[rgba(255, 212, 0, 1)]",

    // Mark overlap (flat)
    markOverlap_base: "bg-[rgba(255,212,0,0.3)] border-b-2 border-b-[rgba(255,212,0,0.7)]",
    markOverlap_selected: "bg-[rgba(255,212,0,0.7)] border-b-2 border-b-[rgba(255,212,0,0.7)]",

    rtl: "text-right",
    tableScrollableWrapper: "PlaygroundEditorTheme__tableScrollableWrapper overflow-x-auto max-w-full my-7",
    table: "border-collapse border-spacing-0 table-fixed w-full",
    tableAddColumns: "relative top-0 w-[20px] bg-gray-200 h-full right-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url(/images/icons/plus.svg)] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40",
    tableAddRows: "absolute bottom-[-25px] w-[calc(100%-25px)] bg-gray-200 h-[20px] left-0 animate-[table-controls_0.2s_ease] border-0 cursor-pointer hover:bg-[#c9dbf0] after:content-[''] after:absolute after:top-0 after:left-0 after:w-full after:h-full after:bg-[url(/images/icons/plus.svg)] after:bg-center after:bg-no-repeat after:bg-contain after:opacity-40",
    tableCell: "border border-gray-400 min-w-[75px] align-top text-left px-2 py-[6px] relative cursor-default outline-none",
    tableCellActionButton: "bg-gray-200 block border-0 rounded-full w-5 h-5 text-gray-900 cursor-pointer hover:bg-gray-300",
    tableCellActionButtonContainer: "block absolute right-1 top-1.5 z-40 w-5 h-5",
    tableCellEditing: "shadow-[0_0_5px_rgba(0,0,0,0.4)] rounded-[3px]",
    tableCellHeader: "bg-[#f2f3f5] text-left",
    tableCellPrimarySelected: "border-2 border-[rgb(60,132,244)] absolute h-[calc(100%-2px)] w-[calc(100%-2px)] left-[-1px] top-[-1px] z-2",
    tableCellResizer: "absolute right-[-4px] h-full w-[8px] cursor-ew-resize z-10 top-0",
    tableCellSelected: "bg-[#c9dbf0]",
    tableCellSortedIndicator: "block opacity-50 absolute bottom-0 left-0 w-full h-[4px] bg-[#999]",
    tableResizeRuler: "block absolute w-[1px] bg-[rgb(60,132,244)] h-full top-0",
    tableSelected: "outline outline-2 outline-[rgb(60,132,244)]",
    charLimit: "inline bg-[#ffbbbb] !important",

    // Editor section styles
    editorEditTreeView: "rounded-none",
    editorViewContainer: "relative block rounded-[10px]",
    editorViewTreeView: "rounded-none",
    editorPlanText: "rounded-t-[10px]",
    testRecorderOutput: "my-5 mx-auto w-full",
    treeViewOutput: "block bg-gray-900 text-white p-0 text-xs my-[1px] mx-auto mb-[10px] relative overflow-hidden rounded-lg",

    // Editor dev button (flat)
    editorDevButton_base: "relative block w-10 h-10 text-xs rounded-[20px] border-none cursor-pointer outline-none shadow-[0px_1px_10px_rgba(0,0,0,0.3)] bg-gray-700 hover:bg-gray-600 after:content-[''] after:absolute after:top-[10px] after:right-[10px] after:bottom-[10px] after:left-[10px] after:block after:bg-contain after:filter invert",
    editorDevButton_active: "bg-red-600",

    testRecorderToolbar: "flex",

    // Test recorder button (flat)
    testRecorderButton_base: "relative block w-8 h-8 text-xs p-[6px] rounded-md border-none cursor-pointer outline-none shadow-md bg-gray-800 transition-shadow duration-75 ease-out after:content-[''] after:absolute after:top-2 after:right-2 after:bottom-2 after:left-2 after:block after:bg-contain after:filter-invert",
    testRecorderButton_active: "shadow-lg",

    componentPickerMenu: "w-[200px]",
    mentionsMenu: "w-[250px]",
    autoEmbedMenu: "w-[150px]",
    emojiMenu: "w-[200px]",

    // Icons (flat)
    icon_plus: "bg-[url(/images/icons/plus.svg)]",
    icon_caretRight: "bg-[url(/images/icons/caret-right-fill.svg)]",
    icon_columns: "bg-[url(/images/icons/3-columns.svg)]",
    icon_dropdownMore: "bg-[url(/images/icons/dropdown-more.svg)]",
    icon_fontColor: "bg-[url(/images/icons/font-color.svg)]",
    icon_fontFamily: "bg-[url(/images/icons/font-family.svg)]",
    icon_bgColor: "bg-[url(/images/icons/bg-color.svg)]",
    icon_table: "bg-[#6c757d] bg-[url(/images/icons/table.svg)] mask-[url(/images/icons/table.svg)] mask-no-repeat mask-size-contain",
    icon_paragraph: "bg-[url(/images/icons/text-paragraph.svg)]",
    icon_h1: "bg-[url(/images/icons/type-h1.svg)]",
    icon_h2: "bg-[url(/images/icons/type-h2.svg)]",
    icon_h3: "bg-[url(/images/icons/type-h3.svg)]",
    icon_h4: "bg-[url(/images/icons/type-h4.svg)]",
    icon_h5: "bg-[url(/images/icons/type-h5.svg)]",
    icon_h6: "bg-[url(/images/icons/type-h6.svg)]",
    icon_bulletList: "bg-[url(/images/icons/list-ul.svg)]",
    icon_bullet: "bg-[url(/images/icons/list-ul.svg)]",
    icon_checkList: "bg-[url(/images/icons/square-check.svg)]",
    icon_check: "bg-[url(/images/icons/square-check.svg)]",
    icon_numberedList: "bg-[url(/images/icons/list-ol.svg)]",
    icon_number: "bg-[url(/images/icons/list-ol.svg)]",
    icon_quote: "bg-[url(/images/icons/chat-square-quote.svg)]",
    icon_code: "bg-[url(/images/icons/code.svg)]",
    icon_strikethrough: "bg-[url(/images/icons/type-strikethrough.svg)]",
    icon_subscript: "bg-[url(/images/icons/type-subscript.svg)]",
    icon_superscript: "bg-[url(/images/icons/type-superscript.svg)]",
    icon_palette: "bg-[url(/images/icons/palette.svg)]",
    icon_bucket: "bg-[url(/images/icons/paint-bucket.svg)]",
    icon_bold: "bg-[url(/images/icons/type-bold.svg)]",
    icon_italic: "bg-[url(/images/icons/type-italic.svg)]",
    icon_clear: "bg-[url(/images/icons/trash.svg)]",
    icon_underline: "bg-[url(/images/icons/type-underline.svg)]",
    icon_link: "bg-[url(/images/icons/link.svg)]",
    icon_horizontalRule: "bg-[url(/images/icons/horizontal-rule.svg)]",
    icon_centerAlign: "bg-[url(/images/icons/text-center.svg)]",
    icon_rightAlign: "bg-[url(/images/icons/text-right.svg)]",
    icon_justifyAlign: "bg-[url(/images/icons/justify.svg)]",
    icon_indent: "bg-[url(/images/icons/indent.svg)]",
    icon_markdown: "bg-[url(/images/icons/markdown.svg)]",
    icon_outdent: "bg-[url(/images/icons/outdent.svg)]",
    icon_undo: "bg-[url(/images/icons/arrow-counterclockwise.svg)]",
    icon_redo: "bg-[url(/images/icons/arrow-clockwise.svg)]",
    icon_sticky: "bg-[url(/images/icons/sticky.svg)]",
    icon_mic: "bg-[url(/images/icons/mic.svg)]",
    icon_import: "bg-[url(/images/icons/upload.svg)]",
    icon_export: "bg-[url(/images/icons/download.svg)]",
    icon_diagram2: "bg-[url(/images/icons/diagram-2.svg)]",
    icon_user: "bg-[url(/images/icons/user.svg)]",
    icon_equation: "bg-[url(/images/icons/plus-slash-minus.svg)]",
    icon_gif: "bg-[url(/images/icons/filetype-gif.svg)]",
    icon_copy: "bg-[url(/images/icons/copy.svg)]",
    icon_success: "bg-[url(/images/icons/success.svg)]",
    icon_prettier: "bg-[url(/images/icons/prettier.svg)]",
    icon_prettierError: "bg-[url(/images/icons/prettier-error.svg)]",
    icon_image: "bg-[url(/images/icons/file-image.svg)]",
    icon_close: "bg-[url(/images/icons/close.svg)]",
    icon_figma: "bg-[url(/images/icons/figma.svg)]",
    icon_poll: "bg-[url(/images/icons/card-checklist.svg)]",
    icon_tweet: "bg-[url(/images/icons/tweet.svg)]",
    icon_youtube: "bg-[url(/images/icons/youtube.svg)]",
    icon_leftAlign: "bg-[url(/images/icons/text-left.svg)]",

    iconChevronDown: "bg-transparent bg-contain inline-block h-[8px] w-[8px] bg-[url(/images/icons/chevron-down.svg)]",

    // Switch (flat)
    switch_base: "block text-gray-700 my-[5px] bg-gray-200 bg-opacity-70 py-[5px] px-[10px] rounded-lg",
    switch_richTextSwitch: "absolute right-0",
    switch_characterCountSwitch: "absolute right-[130px]",
    switch_label: "mr-1 line-height-[24px] w-[100px] text-[14px] inline-block align-middle",
    switch_button: "bg-[rgb(206,208,212)] h-[24px] box-border rounded-[12px] w-[44px] inline-block align-middle relative outline-none cursor-pointer transition-colors duration-[100ms] border-[2px] border-transparent focus-visible:border-blue-500",
    switch_buttonSpan: "absolute top-0 left-0 block w-[20px] h-[20px] rounded-[12px] bg-white transition-transform duration-[200ms]",
    switch_buttonChecked: "bg-[rgb(24,119,242)]",
    switch_buttonCheckedSpan: "translate-x-[20px]",

    // Link editor (flat)
    linkEditor_base: "flex absolute top-0 left-0 z-10 max-w-[400px] w-full opacity-0 bg-white shadow-lg rounded-b-lg transition-opacity duration-500 will-change-transform",
    linkEditor_button_active: "bg-[rgb(223,232,250)]",
    linkEditor_button_base: "w-[20px] h-[20px] inline-block p-[6px] rounded-lg cursor-pointer mx-[2px]",
    linkEditor_button_hovered: "w-[20px] h-[20px] inline-block bg-gray-200",
    linkEditor_button_i: "bg-contain inline-block h-[20px] w-[20px] align-middle",
    linkEditor_linkInput_base: "block w-[calc(100%-75px)] box-border m-3 p-2 rounded-[15px] bg-[#eee] text-[15px] text-[rgb(5,5,5)] border-0 outline-0 relative font-inherit",
    linkEditor_linkInput_a: "text-[rgb(33,111,219)] underline whitespace-nowrap overflow-hidden mr-[30px] overflow-ellipsis hover:underline",
    linkEditor_linkView_base: "block w-[calc(100%-24px)] m-2 p-2 rounded-[15px] text-[15px] text-[rgb(5,5,5)] border-0 outline-0 relative font-inherit",
    linkEditor_linkView_a: "block break-words w-[calc(100%-33px)]",
    linkEditor_div_linkEdit: "bg-[url(/images/icons/pencil-fill.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-[30px] top-0 bottom-0 cursor-pointer",
    linkEditor_div_linkTrash: "bg-[url(/images/icons/trash.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer",
    linkEditor_div_linkCancel: "bg-[url(/images/icons/close.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[28px]",
    linkEditor_div_linkConfirm: "bg-[url(/images/icons/success-alt.svg)] bg-[length:16px] bg-center bg-no-repeat w-[35px] align-middle absolute right-0 top-0 bottom-0 cursor-pointer mr-[2px]",
    linkEditor_fontSizeWrapper: "flex mx-[4px]",
    linkEditor_fontFamilyWrapper: "flex mx-[4px]",
    linkEditor_select: "p-[6px] border-0 bg-[rgba(0,0,0,0.075)] rounded-[4px]",
    linkEditor_buttonHovered: "w-5 h-5 inline-block bg-gray-200",
    linkEditor_icon: "bg-contain inline-block h-5 w-5 align-middle",

    // Mention (flat)
    mention_focus: "shadow-[0_0_0_2px_rgb(180,213,255)] outline-none",

    // Block controls (flat)
    blockControls_base: "absolute right-2 top-4 w-8 h-8 box-border shadow-md z-10 rounded-lg border border-gray-300 overflow-hidden",
    blockControls_button_base: "border border-white bg-white block transition-colors duration-100 ease-in cursor-pointer outline-none rounded-lg p-1 hover:bg-gray-200",
    blockControls_button_focusVisible: "focus-visible:border-blue-500",
    blockControls_span_base: "block w-[18px] h-[18px] m-[2px] bg-contain",
    blockControls_span_paragraph: "bg-[url(/images/icons/text-paragraph.svg)]",
    blockControls_span_h1: "bg-[url(/images/icons/type-h1.svg)]",
    blockControls_span_h2: "bg-[url(/images/icons/type-h2.svg)]",
    blockControls_span_quote: "bg-[url(/images/icons/chat-square-quote.svg)]",
    blockControls_span_ul: "bg-[url(/images/icons/list-ul.svg)]",
    blockControls_span_ol: "bg-[url(/images/icons/list-ol.svg)]",
    blockControls_span_code: "bg-[url(/images/icons/code.svg)]",

    // Characters limit (flat)
    charactersLimit_base: "text-gray-400 text-xs text-right block absolute left-3 bottom-1",
    charactersLimit_exceeded: "text-red-500",

    // Dropdown (flat)
    dropdown_base: "z-10 block fixed shadow-lg rounded-[8px] min-h-[40px] bg-white",
    dropdown_item_base: "m-0 mx-2 p-2 text-[#050505] cursor-pointer leading-4 text-[15px] flex items-center flex-row flex-shrink-0 justify-between bg-white rounded-lg border-0 max-w-[250px] min-w-[100px] hover:bg-gray-200",
    dropdown_item_fontSizeItem: "min-w-unset",
    dropdown_item_fontSizeText: "min-w-unset",
    dropdown_item_active: "flex w-5 h-5 bg-contain",
    dropdown_item_firstChild: "mt-2",
    dropdown_item_lastChild: "mb-2",
    dropdown_item_text: "flex leading-5 flex-grow min-w-[150px]",
    dropdown_item_icon: "flex w-5 h-5 select-none mr-3 leading-4 bg-contain bg-center bg-no-repeat",
    dropdown_divider: "w-auto bg-gray-200 my-1 h-[1px] mx-2",

    switchbase: "block text-gray-700 my-1 bg-[rgba(238,_238,_238,_0.7)] p-1 px-[10px] rounded-lg",
    switchlabel: "mr-1 leading-6 w-[100px] text-sm inline-block align-middle",
    switchbutton: "bg-gray-300 h-[24px] box-border rounded-full w-[44px] inline-block align-middle relative outline-none cursor-pointer transition-colors duration-100 border-2 border-transparent",
    switchbuttonFocus: "focus-visible:border-blue-500",
    switchbuttonSpan: "absolute top-0 left-0 block w-[20px] h-[20px] rounded-full bg-white transition-transform duration-200",
    switchbuttonChecked: "bg-blue-600",
    switchbuttonCheckedSpan: "translate-x-[20px]",

    // Editor (flat)
    editor_base: "flex-auto relative resize-y z-negative",
    editor_image_base: "inline-block relative cursor-default select-none",
    editor_image_img_base: "max-w-full cursor-default",
    editor_image_img_focused: "outline outline-2 outline-blue-600",
    editor_image_img_draggable_base: "cursor-grab",
    editor_image_img_draggable_active: "cursor-grabbing",
    editor_image_captionContainer: "block absolute bottom-1 left-0 right-0 p-0 m-0 border-t border-white bg-opacity-90 bg-white min-w-[100px] text-black overflow-hidden",
    editor_image_captionButton: "block absolute bottom-5 left-0 right-0 w-[30%] mx-auto p-2 border border-white/30 rounded bg-black bg-opacity-50 min-w-[100px] text-white cursor-pointer select-none hover:bg-blue-500",
    editor_image_resizer_base: "block w-[7px] h-[7px] absolute bg-blue-600 border border-white",
    editor_image_resizer_n: "z-[10] top-[-6px] left-[48%] cursor-n-resize",
    editor_image_resizer_ne: "z-[10] top-[-6px] right-[-6px] cursor-ne-resize",
    editor_image_resizer_e: "z-[10] bottom-[48%] right-[-6px] cursor-e-resize",
    editor_image_resizer_se: "z-[10] bottom-[-2px] right-[-6px] cursor-se-resize",
    editor_image_resizer_s: "z-[10] bottom-[-2px] left-[48%] cursor-s-resize",
    editor_image_resizer_sw: "z-[10] bottom-[-2px] left-[-6px] cursor-sw-resize",
    editor_image_resizer_w: "z-[10] bottom-[48%] left-[-6px] cursor-w-resize",
    editor_image_resizer_nw: "z-[10] top-[-6px] left-[-6px] cursor-nw-resize",
    editor_inlineImage_base: "inline-block relative z-10 cursor-default select-none",
    editor_inlineImage_img_base: "cursor-default",
    editor_inlineImage_img_focused: "outline outline-2 outline-blue-600",
    editor_inlineImage_img_draggable_base: "cursor-grab",
    editor_inlineImage_img_draggable_active: "cursor-grabbing",
    editor_inlineImage_captionContainer: "block bg-gray-200 min-w-full text-black overflow-hidden",
    editor_inlineImage_editButton_base: "block absolute top-3 right-3 py-[6px] px-[8px] border border-white/30 rounded-md bg-black/50 min-w-[60px] text-white cursor-pointer select-none hover:bg-blue-500",
    editor_inlineImage_editButton_hide: "hidden",
    editor_inlineImage_position_full: "my-4",
    editor_inlineImage_position_left: "float-left w-fit mx-1 mb-0",
    editor_inlineImage_position_right: "float-right w-fit mb-0 mx-1",
    editor_inlineImage_resizer_base: "block w-[7px] h-[7px] absolute bg-blue-600 border border-white",
    editor_inlineImage_resizer_n: "top-[-6px] left-[48%] cursor-n-resize",
    editor_inlineImage_resizer_ne: "top-[-6px] right-[-6px] cursor-ne-resize",
    editor_inlineImage_resizer_e: "bottom-[48%] right-[-6px] cursor-e-resize",
    editor_inlineImage_resizer_se: "bottom-[-2px] right-[-6px] cursor-se-resize",
    editor_inlineImage_resizer_s: "bottom-[-2px] left-[48%] cursor-s-resize",
    editor_inlineImage_resizer_sw: "bottom-[-2px] left-[-6px] cursor-sw-resize",
    editor_inlineImage_resizer_w: "bottom-[48%] left-[-6px] cursor-w-resize",
    editor_inlineImage_resizer_nw: "top-[-6px] left-[-6px] cursor-nw-resize",

    keyword: "text-[#f1765e] font-bold",

    // Table disable cell (flat)
    tableDisableCell_disableSelection_base: "",
    tableDisableCell_disableSelection_selectedSpan: "bg-transparent",
    tableDisableCell_disableSelection_selectedBr: "bg-transparent",

    cellActionButtonContainer: "absolute top-0 left-0 will-change-transform",
    cellActionButton: "bg-none flex justify-center items-center border-0 relative rounded-[15px] text-[#222] inline-block cursor-pointer",

    // Action button (flat)
    actionButton_base: "bg-[#eee] border-0 px-3 py-2 relative ml-[5px] rounded-[15px] text-[#222] inline-block cursor-pointer hover:bg-[#ddd] hover:text-black",
    actionButton_disabled: "bg-gray-200 cursor-not-allowed opacity-60",

    // Typeahead popover (flat)
    typeaheadPopover_base: "bg-white shadow-[0_5px_10px_rgba(0,0,0,0.3)] rounded-[8px] mt-[25px]",
    typeaheadPopover_ul_base: "p-0 list-none m-0 rounded-[8px] max-h-[200px] overflow-y-scroll scrollbar-none",
    typeaheadPopover_ul_li_base: "m-0 min-w-[180px] text-[14px] outline-none cursor-pointer rounded-[8px] hover:bg-gray-200",
    typeaheadPopover_ul_li_selected: "bg-gray-200",
    typeaheadPopover_ul_li_item: "p-[8px] text-[#050505] cursor-pointer leading-[16px] text-[15px] flex items-center shrink-0 rounded-[8px] border-0",
    typeaheadPopover_ul_li_active: "flex w-[20px] h-[20px] bg-contain",
    typeaheadPopover_ul_li_firstChild: "rounded-t-[8px]",
    typeaheadPopover_ul_li_lastChild: "rounded-b-[8px]",
    typeaheadPopover_ul_li_hover: "bg-gray-200",
    typeaheadPopover_ul_li_text: "flex items-center leading-[20px] grow min-w-[150px]",
    typeaheadPopover_ul_li_icon: "flex w-[20px] h-[20px] select-none mr-[8px] leading-[16px] bg-contain bg-no-repeat bg-center",
    typeaheadPopover_li: "m-0 mx-2 p-2 text-[#050505] cursor-pointer leading-4 text-[15px] flex items-center flex-row flex-shrink-0 bg-white rounded-lg border-0",

    // Debug timetravel panel (flat)
    debugTimetravelPanel_base: "overflow-hidden p-0 pb-2.5 m-auto flex",
    debugTimetravelPanel_slider: "p-0 flex-[8]",
    debugTimetravelPanel_button: "p-0 border-0 bg-none flex-[1] text-white text-xs hover:underline",

    debugTimetravelButton: "absolute top-2.5 right-3 border-0 p-0 text-xs text-white bg-transparent hover:underline",
    debugTreetypeButton: "absolute top-2.5 right-[85px] border-0 p-0 text-xs text-white bg-transparent hover:underline",
    connecting: "absolute top-2.5 left-2.5 text-[15px] text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none",

    // Toolbar (flat)
    toolbar_base: "flex flex-wrap h-fit overflow-hidden mb[1px] p-1 rounded-tl-lg rounded-tr-lg sticky top-0 items-center",
    toolbar_toolbarItem_base: "border-0 flex bg-none rounded-lg p-2 cursor-pointer align-middle flex-shrink-0 items-center justify-between hover:bg-gray-200",
    toolbar_toolbarItem_disabled_base: "cursor-not-allowed",
    toolbar_toolbarItem_disabled_icon: "opacity-20",
    toolbar_toolbarItem_disabled_text: "opacity-20",
    toolbar_toolbarItem_disabled_iconFormat: "opacity-60",
    toolbar_toolbarItem_disabled_chevronDown: "opacity-20",
    toolbar_toolbarItem_spaced: "mr-2",
    toolbar_toolbarItem_iconFormat: "flex h-[18px] w-[18px] opacity-60 custom-vertical-align",
    toolbar_toolbarItem_active_base: "bg-[rgba(223,232,250,0.3)]",
    toolbar_toolbarItem_active_i: "opacity-100",
    toolbar_toolbarItem_fontFamilyText: "block max-w-[10rem]",
    toolbar_toolbarItem_text: "flex leading-[20px] custom-vertical-align text-[14px] text-gray-500 truncate overflow-hidden h-[20px] text-left pr-[10px]",
    toolbar_toolbarItem_icon: "flex w-5 h-5 select-none mr-2 leading-4 bg-contain",
    toolbar_codeLanguage: "w-[150px]",
    toolbar_chevronDownIcon: "mt-1 w-4 h-4 flex select-none",
    toolbar_chevronDownIconInside: "w-4 h-4 flex ml-6 mt-2.5 mr-2 pointer-events-none",
    toolbar_divider: "w-[1px] bg-[#eee] mx-[4px] h-[35px]",

    // Sticky note container (flat)
    stickyNoteContainer_base: "absolute z-9 w-[120px] inline-block",
    stickyNoteContainer_dragging: "transition-none",

    // Sticky note (flat)
    stickyNote_base: "relative block cursor-move text-left w-[120px] m-6 p-[20px] border border-[#e8e8e8] font-[Reenie_Beanie] text-[24px] rounded-br-[60px]",
    stickyNote_contentEditable: "min-h-[20px] border-0 resize-none cursor-text text-[24px] caret-black block relative tab-[1] outline-none p-[10px] select-text whitespace-pre-wrap break-words",
    stickyNote_placeholder: "text-[24px] text-gray-500 overflow-hidden absolute truncate top-[30px] left-[20px] w-[120px] select-none whitespace-nowrap inline-block pointer-events-none",
    stickyNote_after: "absolute z-[-1] right-0 bottom-[20px] w-[120px] h-[25px] bg-black/20 shadow-[2px_15px_5px_rgba(0,0,0,0.4)] transform -scale-x-100",
    stickyNote_yellow: "border-t border-[#fdfd86] bg-gradient-to-br from-[#ffff88] to-[#ffffc6]",
    stickyNote_pink: "border-t border-[#e7d1e4] bg-gradient-to-br from-[#f7cbe8] to-[#e7bfe1]",
    stickyNote_div: "cursor-text",
    stickyNote_delete: "absolute top-[8px] right-[10px] text-[10px] border-0 bg-none cursor-pointer opacity-50 hover:font-bold hover:opacity-100",
    stickyNote_color: "absolute top-[8px] right-[25px] border-0 bg-none opacity-50 hover:opacity-100",
    stickyNote_colorIcon: "block w-[12px] h-[12px] bg-contain",

    // Excalidraw button (flat)
    excalidrawButton_base: "border-0 p-0 m-0 bg-transparent",
    excalidrawButton_selected: "outline outline-2 outline-[rgb(60,132,244)] user-select-none",

    // HR (flat)
    hr_base: "p-[2px] border-none my-4 cursor-pointer relative",
    hr_after: "absolute left-0 right-0 h-[2px] bg-[#ccc] leading-[2px]",
    hr_selected: "outline-[2px] outline-solid outline-[#3c84f4] select-none",

    spacer: "tracking[-2px]",

    // Editor equation (flat)
    editorEquation_base: "cursor-default select-none",
    editorEquation_focused: "outline-2 outline-solid outline-[#3c84f4]",

    buttonItemIcon: "opacity-60",
    dropdownItemActive: "bg-[#dfe8fa4d]",
    dropdownItemActiveIcon: "opacity-100",
    tableNodeContentEditable: "min-h-[20px] border-0 resize-none cursor-text block relative tab-size-1 outline-0 p-0 select-text text-[15px] whitespace-pre-wrap break-words z-3",

    // Nestable (flat)
    nestable_base: "relative",
    nestable_list: "p-0 list-none",
    nestable_listDirectChild: "p-0",
    nestable_item: "m-0",
    nestable_itemFirstChild: "mt-0",
    nestable_itemList: "mt-0",
    nestable_isDragging_list: "pointer-events-none",
    nestable_isDragging_allElements: "opacity-0",
    nestable_isDragging_before: "absolute inset-0 rounded-md",
    nestable_itemIcon: "mr-1 cursor-pointer",
    nestable_dragLayer: "fixed top-0 left-0 z-[100] pointer-events-none",
    nestable_dragLayerList: "absolute top-0 left-0 p-0",
    nestable_icon_base: "relative inline-block w-5 h-5 bg-transparent bg-center bg-no-repeat",
    nestable_icon_before: "hidden",
    nestable_iconPlusGray: 'w-5 h-5 bg-[url("./icon-plus-gray.svg")]',
    nestable_iconMinusGray: 'w-5 h-5 bg-[url("./icon-minus-gray.svg")]',

    // Draggable block menu (flat)
    draggableBlockMenu_base: "rounded-md p-0.5 cursor-grab opacity-0 absolute -left-8 top-0 will-change-transform hover:bg-gray-200",
    draggableBlockMenu_icon: "w-4 h-4 opacity-30 bg-[url(/images/icons/draggable-block-menu.svg)]",
    draggableBlockMenu_active: "cursor-grabbing",

    // Draggable block target line (flat)
    draggableBlockTargetLine_base: "pointer-events-none bg-blue-500 h-1 absolute left-0 top-0 opacity-0 will-change-transform",

    // Floating text format popup (flat)
    floatingTextFormatPopup_base: "flex bg-white p-1 align-middle absolute top-0 left-0 z-10 opacity-0 shadow-md rounded-lg transition-opacity duration-500 h-11 will-change-transform",
    floatingTextFormatPopup_popupItem_base: "border-0 flex bg-transparent rounded-lg p-2 cursor-pointer align-middle",
    floatingTextFormatPopup_popupItem_disabled: "cursor-not-allowed",
    floatingTextFormatPopup_popupItem_spaced: "mr-[2px]",
    floatingTextFormatPopup_popupItem_icon: "bg-contain inline-block h-[18px] w-[18px] mt-[2px] flex opacity-60",
    floatingTextFormatPopup_popupItem_disabledIcon: "opacity-20",
    floatingTextFormatPopup_popupItem_active: "bg-[rgba(223,232,250,0.3)]",
    floatingTextFormatPopup_popupItem_activeIcon: "opacity-100",
    floatingTextFormatPopup_popupItem_hover: "hover:bg-gray-200",
    floatingTextFormatPopup_select_base: "border-0 flex bg-transparent rounded-lg p-2 w-18 text-sm text-gray-500 truncate appearance-none",
    floatingTextFormatPopup_select_codeLanguage: "capitalize w-32",
    floatingTextFormatPopup_text: "flex items-center text-[14px] text-gray-500 leading-[20px] w-[70px] h-[20px] overflow-hidden text-left truncate",
    floatingTextFormatPopup_icon: "flex w-5 h-5 select-none mr-2 leading-4 bg-contain",
    floatingTextFormatPopup_chevronDown: "mt-0.75 w-4 h-4 flex select-none",
    floatingTextFormatPopup_chevronInside: "w-4 h-4 flex ml-[-6.25rem] mt-[11px] mr-[10px] pointer-events-none",
    floatingTextFormatPopup_divider: "w-px bg-gray-200 mx-1",
    floatingTextFormatPopup_insertComment: "hidden md:block",

    // Collapsible (flat)
    collapsible_container: "bg-[#fcfcfc] border border-gray-200 rounded-lg mb-2",
    collapsible_containerOpen: "bg-transparent border-none",
    collapsible_title: "scroll-mt-24 cursor-pointer p-1.25 pl-5 relative font-bold list-none outline-none",
    collapsible_titleBefore: "absolute left-1.75 top-1/2 transform -translate-y-1/2 border border-solid border-transparent border-l-black border-t-[4px] border-b-[4px] border-l-[6px] border-r-[6px]",
    collapsible_titleBeforeClosed: "border-[0.25rem_0.375rem_0.25rem_0.375rem]",
    collapsible_titleBeforeOpen: "border-[0.375rem_0.25rem_0_0.25rem] border-t-black bg-transparent",
    collapsible_content: "p-0 pl-5 pb-[5px]",
    collapsible_collapsedContent: "hidden select-none",

    // Table of contents (flat)
    tableOfContents_container: "fixed top-52 right-[-35px] p-[10px] w-[250px] flex flex-row justify-start z-10 h-[300px] text-[#65676b]",
    tableOfContents_headings: "list-none mt-0 ml-[10px] p-0 overflow-scroll w-[200px] h-[220px] overflow-x-hidden overflow-y-auto scrollbar-hide",
    tableOfContents_heading1: "text-black font-bold cursor-pointer",
    tableOfContents_heading2: "ml-[10px]",
    tableOfContents_heading3: "ml-5",
    tableOfContents_normalHeading: "cursor-pointer leading-5 text-base",
    tableOfContents_selectedHeading: "text-[#3578e5] relative",
    tableOfContents_selectedHeadingWrapper: "relative",
    tableOfContents_selectedHeadingBefore: "absolute inline-block left-[-30px] top-1 z-10 h-1 w-1 bg-[#3578e5] border-4 border-white rounded-full",
    tableOfContents_normalHeadingWrapper: "ml-8 relative",

    // Image node (flat)
    imageNode_contentEditable: "min-h-[20px] border-0 resize-none cursor-text caret-[#050505] block relative tab-[1] outline-0 p-[10px] select-text text-[12px] w-[calc(100%-20px)] whitespace-pre-wrap break-words",
    imageNode_placeholder: "text-[12px] text-gray-500 overflow-hidden absolute text-ellipsis top-[10px] left-[10px] select-none whitespace-nowrap inline-block pointer-events-none",

    imageControlWrapperResizing: "touch-none",

    // Actions (flat)
    actions_base: "absolute text-right m-[10px] bottom-0 right-0",
    actions_treeView: "rounded-bl-none rounded-br-none",
    actions_i_base: "bg-contain inline-block h-[15px] w-[15px] align-[-0.25em]",
    actions_i_indent: "bg-[url(/images/icons/indent.svg)]",
    actions_i_outdent: "bg-[url(/images/icons/outdent.svg)]",
    actions_i_lock: "bg-[url(/images/icons/lock-fill.svg)]",
    actions_i_unlock: "bg-[url(/images/icons/lock.svg)]",
    actions_i_image: "bg-[url(/images/icons/file-image.svg)]",
    actions_i_table: "bg-[url(/images/icons/table.svg)]",
    actions_i_leftAlign: "bg-[url(/images/icons/text-left.svg)]",
    actions_i_centerAlign: "bg-[url(/images/icons/text-center.svg)]",
    actions_i_rightAlign: "bg-[url(/images/icons/text-right.svg)]",
    actions_i_justifyAlign: "bg-[url(/images/icons/justify.svg)]",
    actions_i_disconnect: "bg-[url(/images/icons/plug.svg)]",
    actions_i_connect: "bg-[url(/images/icons/plug-fill.svg)]",
  },
  // Style 1: Dark (white text on dark backgrounds)
  {
    name: "Dark",
    contentEditable: 'border-none relative [tab-size:1] outline-none',
    editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0 resize-y",
    viewScroller: "border-0 flex relative outline-0 z-0 resize-none",
    editorContainer: "relative block rounded-[10px] min-h-[50px]",
    editorShell: "font-['Proxima_Nova'] font-[400] text-[16px] text-white leading-[22.4px]",
    heading_h1: "pt-[8px] font-[500] text-[64px] text-white leading-[40px] uppercase font-['Oswald'] pb-[12px]",
    heading_h2: "pt-[8px] font-[500] text-[24px] text-white leading-[24px] scroll-mt-36 font-['Oswald']",
    heading_h3: "pt-[8px] font-[500] text-[16px] text-white font-['Oswald']",
    heading_h4: "pt-[8px] font-medium scroll-mt-36 text-white font-display",
    heading_h5: "scroll-mt-36 font-display",
    heading_h6: "scroll-mt-36 font-display",
  }]
};

/**
 * Converts flat theme keys back to nested structure for LexicalComposer.
 * This is necessary because Lexical expects a nested theme object.
 *
 * @param {Object} flatTheme - The flat theme object with underscore-separated keys
 * @returns {Object} - Nested theme object for Lexical
 */
export function buildLexicalInternalTheme(flatTheme) {
  const nested = {};

  // Handle simple top-level keys
  const simpleKeys = [
    'editorScroller', 'viewScroller', 'editorContainer', 'editorShell', 'card',
    'paragraph', 'contentEditable', 'quote', 'blockCursor', 'characterLimit',
    'layoutContainer', 'layoutItem', 'code', 'hashtag', 'image', 'indent',
    'inlineImage', 'link', 'ltr', 'rtl', 'tableScrollableWrapper', 'table',
    'tableAddColumns', 'tableAddRows', 'tableCell', 'tableCellActionButton',
    'tableCellActionButtonContainer', 'tableCellEditing', 'tableCellHeader',
    'tableCellPrimarySelected', 'tableCellResizer', 'tableCellSelected',
    'tableCellSortedIndicator', 'tableResizeRuler', 'tableSelected', 'charLimit',
    'editorEditTreeView', 'editorViewContainer', 'editorViewTreeView', 'editorPlanText',
    'testRecorderOutput', 'treeViewOutput', 'testRecorderToolbar', 'componentPickerMenu',
    'mentionsMenu', 'autoEmbedMenu', 'emojiMenu', 'iconChevronDown', 'switchbase',
    'switchlabel', 'switchbutton', 'switchbuttonFocus', 'switchbuttonSpan',
    'switchbuttonChecked', 'switchbuttonCheckedSpan', 'keyword',
    'cellActionButtonContainer', 'cellActionButton', 'debugTimetravelButton',
    'debugTreetypeButton', 'connecting', 'spacer', 'buttonItemIcon',
    'dropdownItemActive', 'dropdownItemActiveIcon', 'tableNodeContentEditable',
    'imageControlWrapperResizing'
  ];

  simpleKeys.forEach(key => {
    if (flatTheme[key] !== undefined) {
      nested[key] = flatTheme[key];
    }
  });

  // Build heading object
  nested.heading = {
    h1: flatTheme.heading_h1,
    h2: flatTheme.heading_h2,
    h3: flatTheme.heading_h3,
    h4: flatTheme.heading_h4,
    h5: flatTheme.heading_h5,
    h6: flatTheme.heading_h6,
  };

  // Build text object
  nested.text = {
    bold: flatTheme.text_bold,
    code: flatTheme.text_code,
    italic: flatTheme.text_italic,
    strikethrough: flatTheme.text_strikethrough,
    subscript: flatTheme.text_subscript,
    superscript: flatTheme.text_superscript,
    underline: flatTheme.text_underline,
    underlineStrikethrough: flatTheme.text_underlineStrikethrough,
  };

  // Build codeHighlight object
  nested.codeHighlight = {
    atrule: flatTheme.codeHighlight_atrule,
    attr: flatTheme.codeHighlight_attr,
    boolean: flatTheme.codeHighlight_boolean,
    builtin: flatTheme.codeHighlight_builtin,
    cdata: flatTheme.codeHighlight_cdata,
    char: flatTheme.codeHighlight_char,
    class: flatTheme.codeHighlight_class,
    'class-name': flatTheme.codeHighlight_className,
    comment: flatTheme.codeHighlight_comment,
    constant: flatTheme.codeHighlight_constant,
    deleted: flatTheme.codeHighlight_deleted,
    doctype: flatTheme.codeHighlight_doctype,
    entity: flatTheme.codeHighlight_entity,
    function: flatTheme.codeHighlight_function,
    important: flatTheme.codeHighlight_important,
    inserted: flatTheme.codeHighlight_inserted,
    keyword: flatTheme.codeHighlight_keyword,
    namespace: flatTheme.codeHighlight_namespace,
    number: flatTheme.codeHighlight_number,
    operator: flatTheme.codeHighlight_operator,
    prolog: flatTheme.codeHighlight_prolog,
    property: flatTheme.codeHighlight_property,
    punctuation: flatTheme.codeHighlight_punctuation,
    regex: flatTheme.codeHighlight_regex,
    selector: flatTheme.codeHighlight_selector,
    string: flatTheme.codeHighlight_string,
    symbol: flatTheme.codeHighlight_symbol,
    tag: flatTheme.codeHighlight_tag,
    url: flatTheme.codeHighlight_url,
    variable: flatTheme.codeHighlight_variable,
  };

  // Build embedBlock object
  nested.embedBlock = {
    base: flatTheme.embedBlock_base,
    focus: flatTheme.embedBlock_focus,
  };

  // Build list object
  nested.list = {
    listitem: flatTheme.list_listitem,
    listitemChecked: flatTheme.list_listitemChecked,
    listitemUnchecked: flatTheme.list_listitemUnchecked,
    nested: {
      listitem: flatTheme.list_nested_listitem,
    },
    olDepth: [
      flatTheme.list_olDepth_0,
      flatTheme.list_olDepth_1,
      flatTheme.list_olDepth_2,
      flatTheme.list_olDepth_3,
      flatTheme.list_olDepth_4,
    ],
    ul: flatTheme.list_ul,
  };

  // Build token object
  nested.token = {
    comment: flatTheme.token_comment,
    punctuation: flatTheme.token_punctuation,
    property: flatTheme.token_property,
    selector: flatTheme.token_selector,
    operator: flatTheme.token_operator,
    attr: flatTheme.token_attr,
    variable: flatTheme.token_variable,
    function: flatTheme.token_function,
  };

  // Build mark object
  nested.mark = {
    base: flatTheme.mark_base,
    selected: flatTheme.mark_selected,
  };

  // Build markOverlap object
  nested.markOverlap = {
    base: flatTheme.markOverlap_base,
    selected: flatTheme.markOverlap_selected,
  };

  // Build editorDevButton object
  nested.editorDevButton = {
    base: flatTheme.editorDevButton_base,
    active: flatTheme.editorDevButton_active,
  };

  // Build testRecorderButton object
  nested.testRecorderButton = {
    base: flatTheme.testRecorderButton_base,
    active: flatTheme.testRecorderButton_active,
  };

  // Build icon object
  nested.icon = {};
  Object.keys(flatTheme).filter(k => k.startsWith('icon_')).forEach(k => {
    nested.icon[k.replace('icon_', '')] = flatTheme[k];
  });

  // Build switch object
  nested.switch = {
    base: flatTheme.switch_base,
    richTextSwitch: flatTheme.switch_richTextSwitch,
    characterCountSwitch: flatTheme.switch_characterCountSwitch,
    label: flatTheme.switch_label,
    button: flatTheme.switch_button,
    buttonSpan: flatTheme.switch_buttonSpan,
    buttonChecked: flatTheme.switch_buttonChecked,
    buttonCheckedSpan: flatTheme.switch_buttonCheckedSpan,
  };

  // Build linkEditor object
  nested.linkEditor = {
    base: flatTheme.linkEditor_base,
    button: {
      active: flatTheme.linkEditor_button_active,
      base: flatTheme.linkEditor_button_base,
      hovered: flatTheme.linkEditor_button_hovered,
      i: flatTheme.linkEditor_button_i,
    },
    linkInput: {
      base: flatTheme.linkEditor_linkInput_base,
      a: flatTheme.linkEditor_linkInput_a,
    },
    linkView: {
      base: flatTheme.linkEditor_linkView_base,
      a: flatTheme.linkEditor_linkView_a,
    },
    div: {
      linkEdit: flatTheme.linkEditor_div_linkEdit,
      linkTrash: flatTheme.linkEditor_div_linkTrash,
      linkCancel: flatTheme.linkEditor_div_linkCancel,
      linkConfirm: flatTheme.linkEditor_div_linkConfirm,
    },
    fontSizeWrapper: flatTheme.linkEditor_fontSizeWrapper,
    fontFamilyWrapper: flatTheme.linkEditor_fontFamilyWrapper,
    select: flatTheme.linkEditor_select,
    buttonHovered: flatTheme.linkEditor_buttonHovered,
    icon: flatTheme.linkEditor_icon,
  };

  // Build mention object
  nested.mention = {
    focus: flatTheme.mention_focus,
  };

  // Build blockControls object
  nested.blockControls = {
    base: flatTheme.blockControls_base,
    button: {
      base: flatTheme.blockControls_button_base,
      focusVisible: flatTheme.blockControls_button_focusVisible,
    },
    span: {
      base: flatTheme.blockControls_span_base,
      paragraph: flatTheme.blockControls_span_paragraph,
      h1: flatTheme.blockControls_span_h1,
      h2: flatTheme.blockControls_span_h2,
      quote: flatTheme.blockControls_span_quote,
      ul: flatTheme.blockControls_span_ul,
      ol: flatTheme.blockControls_span_ol,
      code: flatTheme.blockControls_span_code,
    },
  };

  // Build charactersLimit object
  nested.charactersLimit = {
    base: flatTheme.charactersLimit_base,
    exceeded: flatTheme.charactersLimit_exceeded,
  };

  // Build dropdown object
  nested.dropdown = {
    base: flatTheme.dropdown_base,
    item: {
      base: flatTheme.dropdown_item_base,
      fontSizeItem: flatTheme.dropdown_item_fontSizeItem,
      fontSizeText: flatTheme.dropdown_item_fontSizeText,
      active: flatTheme.dropdown_item_active,
      firstChild: flatTheme.dropdown_item_firstChild,
      lastChild: flatTheme.dropdown_item_lastChild,
      text: flatTheme.dropdown_item_text,
      icon: flatTheme.dropdown_item_icon,
    },
    divider: flatTheme.dropdown_divider,
  };

  // Build editor object
  nested.editor = {
    base: flatTheme.editor_base,
    image: {
      base: flatTheme.editor_image_base,
      img: {
        base: flatTheme.editor_image_img_base,
        focused: flatTheme.editor_image_img_focused,
        draggable: {
          base: flatTheme.editor_image_img_draggable_base,
          active: flatTheme.editor_image_img_draggable_active,
        },
      },
      captionContainer: flatTheme.editor_image_captionContainer,
      captionButton: flatTheme.editor_image_captionButton,
      resizer: {
        base: flatTheme.editor_image_resizer_base,
        n: flatTheme.editor_image_resizer_n,
        ne: flatTheme.editor_image_resizer_ne,
        e: flatTheme.editor_image_resizer_e,
        se: flatTheme.editor_image_resizer_se,
        s: flatTheme.editor_image_resizer_s,
        sw: flatTheme.editor_image_resizer_sw,
        w: flatTheme.editor_image_resizer_w,
        nw: flatTheme.editor_image_resizer_nw,
      },
    },
    inlineImage: {
      base: flatTheme.editor_inlineImage_base,
      img: {
        base: flatTheme.editor_inlineImage_img_base,
        focused: flatTheme.editor_inlineImage_img_focused,
        draggable: {
          base: flatTheme.editor_inlineImage_img_draggable_base,
          active: flatTheme.editor_inlineImage_img_draggable_active,
        },
      },
      captionContainer: flatTheme.editor_inlineImage_captionContainer,
      editButton: {
        base: flatTheme.editor_inlineImage_editButton_base,
        hide: flatTheme.editor_inlineImage_editButton_hide,
      },
      position: {
        full: flatTheme.editor_inlineImage_position_full,
        left: flatTheme.editor_inlineImage_position_left,
        right: flatTheme.editor_inlineImage_position_right,
      },
      resizer: {
        base: flatTheme.editor_inlineImage_resizer_base,
        n: flatTheme.editor_inlineImage_resizer_n,
        ne: flatTheme.editor_inlineImage_resizer_ne,
        e: flatTheme.editor_inlineImage_resizer_e,
        se: flatTheme.editor_inlineImage_resizer_se,
        s: flatTheme.editor_inlineImage_resizer_s,
        sw: flatTheme.editor_inlineImage_resizer_sw,
        w: flatTheme.editor_inlineImage_resizer_w,
        nw: flatTheme.editor_inlineImage_resizer_nw,
      },
    },
  };

  // Build tableDisableCell object
  nested.tableDisableCell = {
    disableSelection: {
      base: flatTheme.tableDisableCell_disableSelection_base,
      selectedSpan: flatTheme.tableDisableCell_disableSelection_selectedSpan,
      selectedBr: flatTheme.tableDisableCell_disableSelection_selectedBr,
    },
  };

  // Build actionButton object
  nested.actionButton = {
    base: flatTheme.actionButton_base,
    disabled: flatTheme.actionButton_disabled,
  };

  // Build typeaheadPopover object
  nested.typeaheadPopover = {
    base: flatTheme.typeaheadPopover_base,
    ul: {
      base: flatTheme.typeaheadPopover_ul_base,
      li: {
        base: flatTheme.typeaheadPopover_ul_li_base,
        selected: flatTheme.typeaheadPopover_ul_li_selected,
        item: flatTheme.typeaheadPopover_ul_li_item,
        active: flatTheme.typeaheadPopover_ul_li_active,
        firstChild: flatTheme.typeaheadPopover_ul_li_firstChild,
        lastChild: flatTheme.typeaheadPopover_ul_li_lastChild,
        hover: flatTheme.typeaheadPopover_ul_li_hover,
        text: flatTheme.typeaheadPopover_ul_li_text,
        icon: flatTheme.typeaheadPopover_ul_li_icon,
      },
    },
    li: flatTheme.typeaheadPopover_li,
  };

  // Build debugTimetravelPanel object
  nested.debugTimetravelPanel = {
    base: flatTheme.debugTimetravelPanel_base,
    slider: flatTheme.debugTimetravelPanel_slider,
    button: flatTheme.debugTimetravelPanel_button,
  };

  // Build toolbar object
  nested.toolbar = {
    base: flatTheme.toolbar_base,
    toolbarItem: {
      base: flatTheme.toolbar_toolbarItem_base,
      disabled: {
        base: flatTheme.toolbar_toolbarItem_disabled_base,
        icon: flatTheme.toolbar_toolbarItem_disabled_icon,
        text: flatTheme.toolbar_toolbarItem_disabled_text,
        iconFormat: flatTheme.toolbar_toolbarItem_disabled_iconFormat,
        chevronDown: flatTheme.toolbar_toolbarItem_disabled_chevronDown,
      },
      spaced: flatTheme.toolbar_toolbarItem_spaced,
      iconFormat: flatTheme.toolbar_toolbarItem_iconFormat,
      active: {
        base: flatTheme.toolbar_toolbarItem_active_base,
        i: flatTheme.toolbar_toolbarItem_active_i,
      },
      fontFamilyText: flatTheme.toolbar_toolbarItem_fontFamilyText,
      text: flatTheme.toolbar_toolbarItem_text,
      icon: flatTheme.toolbar_toolbarItem_icon,
    },
    codeLanguage: flatTheme.toolbar_codeLanguage,
    chevronDownIcon: flatTheme.toolbar_chevronDownIcon,
    chevronDownIconInside: flatTheme.toolbar_chevronDownIconInside,
    divider: flatTheme.toolbar_divider,
  };

  // Build stickyNoteContainer object
  nested.stickyNoteContainer = {
    base: flatTheme.stickyNoteContainer_base,
    dragging: flatTheme.stickyNoteContainer_dragging,
  };

  // Build stickyNote object
  nested.stickyNote = {
    base: flatTheme.stickyNote_base,
    contentEditable: flatTheme.stickyNote_contentEditable,
    placeholder: flatTheme.stickyNote_placeholder,
    after: flatTheme.stickyNote_after,
    yellow: flatTheme.stickyNote_yellow,
    pink: flatTheme.stickyNote_pink,
    div: flatTheme.stickyNote_div,
    delete: flatTheme.stickyNote_delete,
    color: flatTheme.stickyNote_color,
    colorIcon: flatTheme.stickyNote_colorIcon,
  };

  // Build excalidrawButton object
  nested.excalidrawButton = {
    base: flatTheme.excalidrawButton_base,
    selected: flatTheme.excalidrawButton_selected,
  };

  // Build hr object
  nested.hr = {
    base: flatTheme.hr_base,
    after: flatTheme.hr_after,
    selected: flatTheme.hr_selected,
  };

  // Build editorEquation object
  nested.editorEquation = {
    base: flatTheme.editorEquation_base,
    focused: flatTheme.editorEquation_focused,
  };

  // Build nestable object
  nested.nestable = {
    base: flatTheme.nestable_base,
    list: flatTheme.nestable_list,
    listDirectChild: flatTheme.nestable_listDirectChild,
    item: flatTheme.nestable_item,
    itemFirstChild: flatTheme.nestable_itemFirstChild,
    itemList: flatTheme.nestable_itemList,
    isDragging: {
      list: flatTheme.nestable_isDragging_list,
      allElements: flatTheme.nestable_isDragging_allElements,
      before: flatTheme.nestable_isDragging_before,
    },
    itemIcon: flatTheme.nestable_itemIcon,
    dragLayer: flatTheme.nestable_dragLayer,
    dragLayerList: flatTheme.nestable_dragLayerList,
    icon: {
      base: flatTheme.nestable_icon_base,
      before: flatTheme.nestable_icon_before,
    },
    iconPlusGray: flatTheme.nestable_iconPlusGray,
    iconMinusGray: flatTheme.nestable_iconMinusGray,
  };

  // Build draggableBlockMenu object
  nested.draggableBlockMenu = {
    base: flatTheme.draggableBlockMenu_base,
    icon: flatTheme.draggableBlockMenu_icon,
    active: flatTheme.draggableBlockMenu_active,
  };

  // Build draggableBlockTargetLine object
  nested.draggableBlockTargetLine = {
    base: flatTheme.draggableBlockTargetLine_base,
  };

  // Build floatingTextFormatPopup object
  nested.floatingTextFormatPopup = {
    base: flatTheme.floatingTextFormatPopup_base,
    popupItem: {
      base: flatTheme.floatingTextFormatPopup_popupItem_base,
      disabled: flatTheme.floatingTextFormatPopup_popupItem_disabled,
      spaced: flatTheme.floatingTextFormatPopup_popupItem_spaced,
      icon: flatTheme.floatingTextFormatPopup_popupItem_icon,
      disabledIcon: flatTheme.floatingTextFormatPopup_popupItem_disabledIcon,
      active: flatTheme.floatingTextFormatPopup_popupItem_active,
      activeIcon: flatTheme.floatingTextFormatPopup_popupItem_activeIcon,
      hover: flatTheme.floatingTextFormatPopup_popupItem_hover,
    },
    select: {
      base: flatTheme.floatingTextFormatPopup_select_base,
      codeLanguage: flatTheme.floatingTextFormatPopup_select_codeLanguage,
    },
    text: flatTheme.floatingTextFormatPopup_text,
    icon: flatTheme.floatingTextFormatPopup_icon,
    chevronDown: flatTheme.floatingTextFormatPopup_chevronDown,
    chevronInside: flatTheme.floatingTextFormatPopup_chevronInside,
    divider: flatTheme.floatingTextFormatPopup_divider,
    insertComment: flatTheme.floatingTextFormatPopup_insertComment,
  };

  // Build collapsible object
  nested.collapsible = {
    container: flatTheme.collapsible_container,
    containerOpen: flatTheme.collapsible_containerOpen,
    title: flatTheme.collapsible_title,
    titleBefore: flatTheme.collapsible_titleBefore,
    titleBeforeClosed: flatTheme.collapsible_titleBeforeClosed,
    titleBeforeOpen: flatTheme.collapsible_titleBeforeOpen,
    content: flatTheme.collapsible_content,
    collapsedContent: flatTheme.collapsible_collapsedContent,
  };

  // Build tableOfContents object
  nested.tableOfContents = {
    container: flatTheme.tableOfContents_container,
    headings: flatTheme.tableOfContents_headings,
    heading1: flatTheme.tableOfContents_heading1,
    heading2: flatTheme.tableOfContents_heading2,
    heading3: flatTheme.tableOfContents_heading3,
    normalHeading: flatTheme.tableOfContents_normalHeading,
    selectedHeading: flatTheme.tableOfContents_selectedHeading,
    selectedHeadingWrapper: flatTheme.tableOfContents_selectedHeadingWrapper,
    selectedHeadingBefore: flatTheme.tableOfContents_selectedHeadingBefore,
    normalHeadingWrapper: flatTheme.tableOfContents_normalHeadingWrapper,
  };

  // Build imageNode object
  nested.imageNode = {
    contentEditable: flatTheme.imageNode_contentEditable,
    placeholder: flatTheme.imageNode_placeholder,
  };

  // Build actions object
  nested.actions = {
    base: flatTheme.actions_base,
    treeView: flatTheme.actions_treeView,
    i: {
      base: flatTheme.actions_i_base,
      indent: flatTheme.actions_i_indent,
      outdent: flatTheme.actions_i_outdent,
      lock: flatTheme.actions_i_lock,
      unlock: flatTheme.actions_i_unlock,
      image: flatTheme.actions_i_image,
      table: flatTheme.actions_i_table,
      leftAlign: flatTheme.actions_i_leftAlign,
      centerAlign: flatTheme.actions_i_centerAlign,
      rightAlign: flatTheme.actions_i_rightAlign,
      justifyAlign: flatTheme.actions_i_justifyAlign,
      disconnect: flatTheme.actions_i_disconnect,
      connect: flatTheme.actions_i_connect,
    },
  };

  return nested;
}

/**
 * Theme editor settings for the lexical theme.
 */
export const lexicalSettings = (theme) => {
  const activeStyle = theme?.lexical?.options?.activeStyle || 0;
  const styles = theme?.lexical?.styles?.[activeStyle] || {};

  return [
    {
      label: "Lexical Editor Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.lexical?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `lexical.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: 'Add Style',
          onClick: (e, setState) => {
            setState(draft => {
              if (!draft.lexical) draft.lexical = { ...lexicalTheme };
              draft.lexical.styles.push({ ...draft.lexical.styles[0], name: 'new style' });
            });
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: 'Remove Style',
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.lexical?.styles?.length > 1) {
                draft.lexical.styles.splice(activeStyle, 1);
                draft.lexical.options.activeStyle = 0;
              }
            });
          }
        },
      ]
    },
    {
      label: "Editor Shell",
      type: 'inline',
      controls: ['editorScroller', 'viewScroller', 'editorContainer', 'editorShell', 'contentEditable', 'paragraph'].map(key => ({
        label: key,
        type: 'Textarea',
        path: `lexical.styles[${activeStyle}].${key}`
      }))
    },
    {
      label: "Headings",
      type: 'inline',
      controls: ['heading_h1', 'heading_h2', 'heading_h3', 'heading_h4', 'heading_h5', 'heading_h6'].map(key => ({
        label: key.replace('heading_', 'H'),
        type: 'Textarea',
        path: `lexical.styles[${activeStyle}].${key}`
      }))
    },
    {
      label: "Text Formatting",
      type: 'inline',
      controls: Object.keys(styles)
        .filter(k => k.startsWith('text_'))
        .map(k => ({
          label: k.replace('text_', ''),
          type: 'Textarea',
          path: `lexical.styles[${activeStyle}].${k}`
        }))
    },
    {
      label: "Toolbar",
      type: 'inline',
      controls: Object.keys(styles)
        .filter(k => k.startsWith('toolbar_'))
        .map(k => ({
          label: k.replace('toolbar_', ''),
          type: 'Textarea',
          path: `lexical.styles[${activeStyle}].${k}`
        }))
    },
    {
      label: "Dropdown",
      type: 'inline',
      controls: Object.keys(styles)
        .filter(k => k.startsWith('dropdown_'))
        .map(k => ({
          label: k.replace('dropdown_', ''),
          type: 'Textarea',
          path: `lexical.styles[${activeStyle}].${k}`
        }))
    }
  ];
};

export default lexicalTheme;
