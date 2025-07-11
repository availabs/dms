/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {
  $createCodeNode,
  $isCodeNode,
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
  getLanguageFriendlyName,
} from '@lexical/code';
import {$isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link';
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isDecoratorBlockNode} from '@lexical/react/LexicalDecoratorBlockNode';
import {INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from '@lexical/rich-text';
import {
  $getSelectionStyleValueForProperty,
  $isParentElementRTL,
  $patchStyleText,
  $setBlocksType,
} from '@lexical/selection';
import {$isTableNode} from '@lexical/table';
import {
  $findMatchingParent,
  $getNearestBlockElementAncestorOrThrow,
  $getNearestNodeOfType,
  mergeRegister,
} from '@lexical/utils';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  KEY_MODIFIER_COMMAND,
  type LexicalEditor,
  type NodeKey,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import {type Dispatch, useCallback, useEffect, useState} from 'react';
import * as React from 'react';
import {IS_APPLE} from '../../shared/environment';

import useModal from '../../hooks/useModal';
import DropDown, {DropDownItem} from '../../ui/DropDown';
import DropdownColorPicker from '../../ui/DropdownColorPicker';
import {getSelectedNode} from '../../utils/getSelectedNode';
import {sanitizeUrl} from '../../utils/url';
import {INSERT_COLLAPSIBLE_COMMAND} from '../CollapsiblePlugin';
import {InsertInlineImageDialog} from '../InlineImagePlugin';
import {InsertTableDialog} from '../TablePlugin';
import theme from "./../../themes/PlaygroundEditorTheme";

const blockTypeToBlockName = {
  bullet: 'Bulleted List',
  check: 'Check List',
  code: 'Code Block',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  number: 'Numbered List',
  paragraph: 'Normal',
  quote: 'Quote',
};

const rootTypeToRootName = {
  root: 'Root',
  table: 'Table',
};

function getCodeLanguageOptions(): [string, string][] {
  const options: [string, string][] = [];

  for (const [lang, friendlyName] of Object.entries(
    CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  )) {
    options.push([lang, friendlyName]);
  }

  return options;
}

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

const FONT_FAMILY_OPTIONS: [string, string][] = [
  ['Arial', 'Arial'],
  ['Courier New', 'Courier New'],
  ['Georgia', 'Georgia'],
  ['Times New Roman', 'Times New Roman'],
  ['Trebuchet MS', 'Trebuchet MS'],
  ['Verdana', 'Verdana'],
];

const FONT_SIZE_OPTIONS: [string, string][] = [
  ['10px', '10px'],
  ['11px', '11px'],
  ['12px', '12px'],
  ['13px', '13px'],
  ['14px', '14px'],
  ['15px', '15px'],
  ['16px', '16px'],
  ['17px', '17px'],
  ['18px', '18px'],
  ['19px', '19px'],
  ['20px', '20px'],
];

const ELEMENT_FORMAT_OPTIONS: {
  [key in Exclude<ElementFormatType, ''>]: {
    icon: string;
    iconRTL: string;
    name: string;
  };
} = {
  center: {
    icon: 'centerAlign',
    iconRTL: 'rightAlign',
    name: 'Center Align',
  },
  end: {
    icon: 'rightAlign',
    iconRTL: 'leftAlign',
    name: 'End Align',
  },
  justify: {
    icon: 'justifyAlign',
    iconRTL: 'justifyAlign',
    name: 'Justify Align',
  },
  left: {
    icon: 'leftAlign',
    iconRTL: 'leftAlign',
    name: 'Left Align',
  },
  right: {
    icon: 'rightAlign',
    iconRTL: 'leftAlign',
    name: 'Right Align',
  },
  start: {
    icon: 'leftAlign',
    iconRTL: 'rightAlign',
    name: 'Start Align',
  },
};

function dropDownActiveClass(active: boolean) {
  if (active) return `${theme.dropdownItemActive}` || 'active dropdown-item-active';
  else return '';
}

function BlockFormatDropDown({
  editor,
  blockType,
  rootType,
  disabled = false,
}: {
  blockType: keyof typeof blockTypeToBlockName;
  rootType: keyof typeof rootTypeToRootName;
  editor: LexicalEditor;
  disabled?: boolean;
}): JSX.Element {
  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection();
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      });
    }
  };

  const formatBulletList = () => {
    if (blockType !== 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatCheckList = () => {
    if (blockType !== 'check') {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatNumberedList = () => {
    if (blockType !== 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatQuote = () => {
    if (blockType !== 'quote') {
      editor.update(() => {
        const selection = $getSelection();
        $setBlocksType(selection, () => $createQuoteNode());
      });
    }
  };

  const formatCode = () => {
    if (blockType !== 'code') {
      editor.update(() => {
        let selection = $getSelection();

        if (selection !== null) {
          if (selection.isCollapsed()) {
            $setBlocksType(selection, () => $createCodeNode());
          } else {
            const textContent = selection.getTextContent();
            const codeNode = $createCodeNode();
            selection.insertNodes([codeNode]);
            selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertRawText(textContent);
            }
          }
        }
      });
    }
  };

  return (
    <DropDown
      disabled={disabled}
      buttonClassName={`${theme.toolbar.toolbarItem.base} block-controls`}
      buttonIconClassName={`${theme.toolbar.toolbarItem.icon} block-type ${theme.icon[blockType]}` + blockType}
      buttonLabel={blockTypeToBlockName[blockType]}
      buttonAriaLabel="Formatting options for text style">
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'paragraph')}
        onClick={formatParagraph}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.paragraph}` } />
        <span className={`${theme.dropdown.item.text}` }>Normal</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'h1')}
        onClick={() => formatHeading('h1')}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.h1}` } />
        <span className={`${theme.dropdown.item.text}`}>Heading 1</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'h2')}
        onClick={() => formatHeading('h2')}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.h2}` } />
        <span className={`${theme.dropdown.item.text}` }>Heading 2</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'h3')}
        onClick={() => formatHeading('h3')}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.h3}` } />
        <span className={`${theme.dropdown.item.text}` || "text"}>Heading 3</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'h4')}
        onClick={() => formatHeading('h4')}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.h4}`} />
        <span className={`${theme.dropdown.item.text}` || "text"}>Heading 4</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'h4')}
        onClick={() => formatHeading('h5')}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.h5}`} />
        <span className={`${theme.dropdown.item.text}` || "text"}>Heading 5</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'bullet')}
        onClick={formatBulletList}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.bulletList}` } />
        <span className={`${theme.dropdown.item.text}` || "text"}>Bullet List</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'number')}
        onClick={formatNumberedList}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.numberedList}`} />
        <span className={`${theme.dropdown.item.text}` || "text"}>Numbered List</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'check')}
        onClick={formatCheckList}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.checkList}` } />
        <span className={`${theme.dropdown.item.text}` || "text"}>Check List</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'quote')}
        onClick={formatQuote}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.quote}`} />
        <span className={`${theme.dropdown.item.text}` || "text"}>Quote</span>
      </DropDownItem>
      <DropDownItem
        className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(blockType === 'code')}
        onClick={formatCode}>
        <i className={`${theme.dropdown.item.icon} ${theme.icon.code}`} />
        <span className={`${theme.dropdown.item.text}` || "text"}>Code Block</span>
      </DropDownItem>
    </DropDown>
  );
}

function Divider(): JSX.Element {
  return <div className={theme.dropdown.divider || "divider"} />;
}

function FontDropDown({
  editor,
  value,
  style,
  disabled = false,
}: {
  editor: LexicalEditor;
  value: string;
  style: string;
  disabled?: boolean;
}): JSX.Element {
  const handleClick = useCallback(
    (option: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, {
            [style]: option,
          });
        }
      });
    },
    [editor, style],
  );

  const buttonAriaLabel =
    style === 'font-family'
      ? 'Formatting options for font family'
      : 'Formatting options for font size';

  return (
    <DropDown
      disabled={disabled}
      buttonClassName={`${theme.toolbar.toolbarItem.base} ${style}`}
      buttonLabel={value}
      buttonIconClassName={
        style === 'font-family' ? 'icon block-type font-family' : ''
      }
      buttonAriaLabel={buttonAriaLabel}>
      {(style === 'font-family' ? FONT_FAMILY_OPTIONS : FONT_SIZE_OPTIONS).map(
        ([option, text]) => (
          <DropDownItem
            className={`${theme.toolbar.toolbarItem.base} ${dropDownActiveClass(value === option)} ${
              style === 'font-size' ? 'fontsize-item' : ''
            }`}
            onClick={() => handleClick(option)}
            key={option}>
            <span className={`${theme.dropdown.item.text}` }>{text}</span>
          </DropDownItem>
        ),
      )}
    </DropDown>
  );
}

function ElementFormatDropdown({
  editor,
  value,
  isRTL,
  disabled = false,
}: {
  editor: LexicalEditor;
  value: ElementFormatType;
  isRTL: boolean;
  disabled: boolean;
}) {
  const formatOption = ELEMENT_FORMAT_OPTIONS[value || 'left'];

  return (
    <DropDown
      disabled={disabled}
      buttonLabel={formatOption.name}
      buttonIconClassName={`${theme.actions.i.base} mr-[8px] ${theme.icon[isRTL ? formatOption.iconRTL : formatOption.icon]}`}
      buttonClassName={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.toolbarItem.spaced} alignment` }
      buttonAriaLabel="Formatting options for text alignment">
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon.leftAlign}` } />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Left Align</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon.centerAlign}` } />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Center Align</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon.rightAlign}` } />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Right Align</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify');
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon.justifyAlign}` } />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Justify Align</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'start');
        }}
        className={`${theme.dropdown.item.base}` }>
        <i
          className={`${theme.actions.i.base} ${theme.icon[isRTL
            ? ELEMENT_FORMAT_OPTIONS.start.iconRTL
            : ELEMENT_FORMAT_OPTIONS.start.icon]
          }`}
        />
        <span className={`${theme.dropdown.item.text}` }>Start Align</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'end');
        }}
        className={`${theme.dropdown.item.base}` }>
        <i
          className={`${theme.actions.i.base} ${theme.icon[isRTL
            ? ELEMENT_FORMAT_OPTIONS.end.iconRTL
            : ELEMENT_FORMAT_OPTIONS.end.icon]}`}
        />
        <span className={`${theme.dropdown.item.text}` }>End Align</span>
      </DropDownItem>
      <Divider />
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon[(isRTL ? 'indent' : 'outdent')]}`} />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Outdent</span>
      </DropDownItem>
      <DropDownItem
        onClick={() => {
          editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        }}
        className={`${theme.dropdown.item.base}` ||"item"}>
        <i className={`${theme.actions.i.base} ${theme.icon[(isRTL ? 'outdent' : 'indent')]}`} />
        <span className={`${theme.dropdown.item.text}` ||"text"}>Indent</span>
      </DropDownItem>
    </DropDown>
  );
}

export default function ToolbarPlugin({
  setIsLinkEditMode,
}: {
  setIsLinkEditMode: Dispatch<boolean>;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockType, setBlockType] =
    useState<keyof typeof blockTypeToBlockName>('paragraph');
  const [rootType, setRootType] =
    useState<keyof typeof rootTypeToRootName>('root');
  const [selectedElementKey, setSelectedElementKey] = useState<NodeKey | null>(
    null,
  );
  const [fontSize, setFontSize] = useState<string>('15px');
  const [fontColor, setFontColor] = useState<string>('#000');
  const [bgColor, setBgColor] = useState<string>('#dfe6ef');
  const [fontFamily, setFontFamily] = useState<string>('Arial');
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('left');
  const [isLink, setIsLink] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [modal, showModal] = useModal();
  const [isRTL, setIsRTL] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<string>('');
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      const elementKey = element.getKey();
      const elementDOM = activeEditor.getElementByKey(elementKey);

      // Update text format
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsSubscript(selection.hasFormat('subscript'));
      setIsSuperscript(selection.hasFormat('superscript'));
      setIsCode(selection.hasFormat('code'));
      setIsRTL($isParentElementRTL(selection));

      // Update links
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      if ($isLinkNode(parent) || $isLinkNode(node)) {
        setIsLink(true);
      } else {
        setIsLink(false);
      }

      const tableNode = $findMatchingParent(node, $isTableNode);
      if ($isTableNode(tableNode)) {
        setRootType('table');
      } else {
        setRootType('root');
      }

      if (elementDOM !== null) {
        setSelectedElementKey(elementKey);
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode,
          );
          const type = parentList
            ? parentList.getListType()
            : element.getListType();
          setBlockType(type);
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType();
          if (type in blockTypeToBlockName) {
            setBlockType(type as keyof typeof blockTypeToBlockName);
          }
          if ($isCodeNode(element)) {
            const language =
              element.getLanguage() as keyof typeof CODE_LANGUAGE_MAP;
            setCodeLanguage(
              language ? CODE_LANGUAGE_MAP[language] || language : '',
            );
            return;
          }
        }
      }
      // Handle buttons
      setFontSize(
        $getSelectionStyleValueForProperty(selection, 'font-size', '15px'),
      );
      setFontColor(
        $getSelectionStyleValueForProperty(selection, 'color', '#000'),
      );
      setBgColor(
        $getSelectionStyleValueForProperty(
          selection,
          'background-color',
          '#dfe6ef',
        ),
      );
      setFontFamily(
        $getSelectionStyleValueForProperty(selection, 'font-family', 'Arial'),
      );
      setElementFormat(
        ($isElementNode(node)
          ? node.getFormatType()
          : parent?.getFormatType()) || 'left',
      );
    }
  }, [activeEditor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        $updateToolbar();
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    if(isEditable !== editor.isEditable()) {
      setIsEditable(editor.isEditable())
    }
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
      activeEditor.registerUpdateListener(({editorState}) => {
        //console.log('registerUpdateListener')
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateToolbar, activeEditor, editor]);

  useEffect(() => {
    return activeEditor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (payload) => {
        const event: KeyboardEvent = payload;
        const {code, ctrlKey, metaKey} = event;

        if (code === 'KeyK' && (ctrlKey || metaKey)) {
          event.preventDefault();
          if (!isLink) {
            setIsLinkEditMode(true);
          } else {
            setIsLinkEditMode(false);
          }
          return activeEditor.dispatchCommand(
            TOGGLE_LINK_COMMAND,
            sanitizeUrl('https://'),
          );
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [activeEditor, isLink, setIsLinkEditMode]);

  const applyStyleText = useCallback(
    (styles: Record<string, string>, skipHistoryStack?: boolean) => {
      activeEditor.update(
        () => {
          const selection = $getSelection();
          if (selection !== null) {
            $patchStyleText(selection, styles);
          }
        },
        skipHistoryStack ? {tag: 'historic'} : {},
      );
    },
    [activeEditor],
  );


  const clearFormatting = useCallback(() => {
    activeEditor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const anchor = selection.anchor;
        const focus = selection.focus;
        const nodes = selection.getNodes();

        if (anchor.key === focus.key && anchor.offset === focus.offset) {
          return;
        }

        nodes.forEach((node, idx) => {
          // We split the first and last node by the selection
          // So that we don't format unselected text inside those nodes
          if ($isTextNode(node)) {
            if (idx === 0 && anchor.offset !== 0) {
              node = node.splitText(anchor.offset)[1] || node;
            }
            if (idx === nodes.length - 1) {
              node = node.splitText(focus.offset)[0] || node;
            }

            if (node.__style !== '') {
              node.setStyle('');
            }
            if (node.__format !== 0) {
              node.setFormat(0);
              $getNearestBlockElementAncestorOrThrow(node).setFormat('');
            }
          } else if ($isHeadingNode(node) || $isQuoteNode(node)) {
            node.replace($createParagraphNode(), true);
          } else if ($isDecoratorBlockNode(node)) {
            node.setFormat('');
          }
        });
      }
    });
  }, [activeEditor]);

  const onFontColorSelect = useCallback(
    (value: string) => {
      applyStyleText({color: value});
    },
    [applyStyleText],
  );

  const onBgColorSelect = useCallback(
    (value: string) => {
      applyStyleText({'background-color': value});
      applyStyleText({'padding': '4px 12px'});
      applyStyleText({'border': '1px solid'});
      applyStyleText({'border-color': '#60a5fa'});
      applyStyleText({'border-radius': '8px'});
      applyStyleText({'padding': '6px'});
      applyStyleText({'display': 'block'})
    },
    [applyStyleText],
  );

  const insertLink = useCallback(() => {
    if (!isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl('https://'));
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, isLink]);

  const onCodeLanguageSelect = useCallback(
    (value: string) => {
      activeEditor.update(() => {
        if (selectedElementKey !== null) {
          const node = $getNodeByKey(selectedElementKey);
          if ($isCodeNode(node)) {
            node.setLanguage(value);
          }
        }
      });
    },
    [activeEditor, selectedElementKey],
  );

  if(!isEditable) return <div className={theme.toolbar.base || "toolbar"}/>

  return (
    <div className={theme.toolbar.base || "toolbar"}>
      <button
        disabled={!canUndo || !isEditable}
        onClick={() => {
          activeEditor.dispatchCommand(UNDO_COMMAND, undefined);
        }}
        title={IS_APPLE ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
        type="button"
        className={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.toolbarItem.spaced}` }
        aria-label="Undo">
        <i className={`${theme.toolbar.toolbarItem.iconFormat} ${theme.icon.undo}` }  />
      </button>
      <button
        disabled={!canRedo || !isEditable}
        onClick={() => {
          activeEditor.dispatchCommand(REDO_COMMAND, undefined);
        }}
        title={IS_APPLE ? 'Redo (⌘Y)' : 'Redo (Ctrl+Y)'}
        type="button"
        className={`${theme.toolbar.toolbarItem.base  }` }
        aria-label="Redo">
        <i className={`${theme.toolbar.toolbarItem.iconFormat} ${theme.icon.redo}` } />
      </button>
      {/* <Divider /> */}
      <div className={theme.toolbar.divider} />
      {blockType in blockTypeToBlockName && activeEditor === editor && (
        <>
          <BlockFormatDropDown
            disabled={!isEditable}
            blockType={blockType}
            rootType={rootType}
            editor={editor}
          />
          {/* <Divider /> */}
          <div className={theme.toolbar.divider} />
        </>
      )}
      {blockType === 'code' ? (
        <DropDown
          disabled={!isEditable}
          buttonClassName={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.codeLanguage}` }
          buttonLabel={getLanguageFriendlyName(codeLanguage)}
          buttonAriaLabel="Select language">
          {CODE_LANGUAGE_OPTIONS.map(([value, name]) => {
            return (
              <DropDownItem
                className={`${theme.dropdown.item.base} ${dropDownActiveClass(
                  value === codeLanguage,
                )}`}
                onClick={() => onCodeLanguageSelect(value)}
                key={value}>
                <span className={`${theme.dropdown.item.base}` || "text"}>{name}</span>
              </DropDownItem>
            );
          })}
        </DropDown>
      ) : (
        <>
          {/*<FontDropDown
            disabled={!isEditable}
            style={'font-family'}
            value={fontFamily}
            editor={editor}
          />*/
          /*<FontDropDown
            disabled={!isEditable}
            style={'font-size'}
            value={fontSize}
            editor={editor}
          />*/}
          {/*<Divider />
          <button
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            }}
            className={'toolbar-item spaced ' + (isBold ? 'active' : '')}
            title={IS_APPLE ? 'Bold (⌘B)' : 'Bold (Ctrl+B)'}
            type="button"
            aria-label={`Format text as bold. Shortcut: ${
              IS_APPLE ? '⌘B' : 'Ctrl+B'
            }`}>
            <i className="format bold" />
          </button>
          <button
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            }}
            className={'toolbar-item spaced ' + (isItalic ? 'active' : '')}
            title={IS_APPLE ? 'Italic (⌘I)' : 'Italic (Ctrl+I)'}
            type="button"
            aria-label={`Format text as italics. Shortcut: ${
              IS_APPLE ? '⌘I' : 'Ctrl+I'
            }`}>
            <i className="format italic" />
          </button>
          <button
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
            }}
            className={'toolbar-item spaced ' + (isUnderline ? 'active' : '')}
            title={IS_APPLE ? 'Underline (⌘U)' : 'Underline (Ctrl+U)'}
            type="button"
            aria-label={`Format text to underlined. Shortcut: ${
              IS_APPLE ? '⌘U' : 'Ctrl+U'
            }`}>
            <i className="format underline" />
          </button>
          <button
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
            }}
            className={'toolbar-item spaced ' + (isCode ? 'active' : '')}
            title="Insert code block"
            type="button"
            aria-label="Insert code block">
            <i className="format code" />
          </button>
          <button
            disabled={!isEditable}
            onClick={insertLink}
            className={'toolbar-item spaced ' + (isLink ? 'active' : '')}
            aria-label="Insert link"
            title="Insert link"
            type="button">
            <i className="format link" />
          </button>*/}

          <DropdownColorPicker
            disabled={!isEditable}
            buttonClassName={`${theme.toolbar.toolbarItem.base} color-picker` }
            buttonAriaLabel="Formatting text color"
            buttonIconClassName={`${theme.dropdown.item.icon} ${theme.icon.fontColor}` }
            color={fontColor}
            onChange={onFontColorSelect}
            title="text color"
          />
          <DropdownColorPicker
            disabled={!isEditable}
            buttonClassName={`${theme.toolbar.toolbarItem.base} color-picker` }
            buttonAriaLabel="Formatting background color"
            buttonIconClassName={`${theme.dropdown.item.icon} ${theme.icon.bgColor}` }
            color={bgColor}
            onChange={onBgColorSelect}
            title="bg color"
          />
          <DropDown
            disabled={!isEditable}
            buttonClassName={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.toolbarItem.spaced}` }
            buttonLabel=""
            buttonAriaLabel="Formatting options for additional text styles"
            buttonIconClassName={`${theme.dropdown.item.icon} ${theme.icon.dropdownMore}` }>
            <DropDownItem
              onClick={() => {
                activeEditor.dispatchCommand(
                  FORMAT_TEXT_COMMAND,
                  'strikethrough',
                );
              }}
              className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(isStrikethrough)}
              title="Strikethrough"
              aria-label="Format text with a strikethrough">
              <i className={`${theme.dropdown.item.icon} ${theme.icon.strikethrough}` } />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Strikethrough</span>
            </DropDownItem>
            <DropDownItem
              onClick={() => {
                activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript');
              }}
              className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(isSubscript)}
              title="Subscript"
              aria-label="Format text with a subscript">
              <i className={`${theme.dropdown.item.icon} ${theme.icon.subscript}` } />
              <span className={`${theme.dropdown.item.text}`}>Subscript</span>
            </DropDownItem>
            <DropDownItem
              onClick={() => {
                activeEditor.dispatchCommand(
                  FORMAT_TEXT_COMMAND,
                  'superscript',
                );
              }}
              className={`${theme.dropdown.item.base || 'item '} ` + dropDownActiveClass(isSuperscript)}
              title="Superscript"
              aria-label="Format text with a superscript">
              <i className={`${theme.dropdown.item.icon} ${theme.icon.superscript}` } />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Superscript</span>
            </DropDownItem>
            <DropDownItem
              onClick={clearFormatting}
              className={`${theme.dropdown.item.base}` || "item"}
              title="Clear text formatting"
              aria-label="Clear all text formatting">
              <i className={`${theme.dropdown.item.icon} ${theme.icon.clear}` } />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Clear Formatting</span>
            </DropDownItem>
          </DropDown>
          {/* <Divider /> */}
          <div className={theme.toolbar.divider} />
          {rootType === 'table' && (
            <>
              <DropDown
                disabled={!isEditable}
                buttonClassName={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.toolbarItem.spaced}` }
                buttonLabel="Table"
                buttonAriaLabel="Open table toolkit"
                buttonIconClassName={`${theme.dropdown.item.icon} ${theme.icon.table} secondary`}>
                <DropDownItem
                  onClick={() => {
                    /**/
                  }}
                  className={`${theme.dropdown.item.base}` || "item"}>
                  <span className={`${theme.dropdown.item.text}` ||"text"}>TODO</span>
                </DropDownItem>
              </DropDown>
              {/* <Divider /> */}
              <div className={theme.toolbar.divider} />
            </>
          )}
          <DropDown
            disabled={!isEditable}
            buttonClassName={`${theme.toolbar.toolbarItem.base} ${theme.toolbar.toolbarItem.spaced}` }
            buttonLabel="Insert"
            buttonAriaLabel="Insert specialized editor node"
            buttonIconClassName={`${theme.dropdown.item.icon} ${theme.icon.plus}` }>
            <DropDownItem
              onClick={() => {
                activeEditor.dispatchCommand(
                  INSERT_HORIZONTAL_RULE_COMMAND,
                  undefined,
                );
              }}
              className={`${theme.dropdown.item.base}` || "item"}>
              <i className={`${theme.dropdown.item.icon} ${theme.icon.horizontalRule}` } />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Horizontal Rule</span>
            </DropDownItem>

            <DropDownItem
              onClick={() => {
                showModal('Insert Image', (onClose) => (
                  <InsertInlineImageDialog
                    activeEditor={activeEditor}
                    onClose={onClose}
                  />
                ));
              }}
              className={`${theme.dropdown.item.base}` || "item"}>
              <i className={`${theme.dropdown.item.icon} ${theme.icon.image}`} />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Image</span>
            </DropDownItem>
            {/*<DropDownItem
              onClick={() =>
                insertGifOnClick({
                  altText: 'Cat typing on a laptop',
                  src: catTypingGif,
                })
              }
              className="item">
              <i className="icon gif" />
              <span className={`${theme.dropdown.item.text}` ||"text"}>GIF</span>
            </DropDownItem>*/}
            {/*<DropDownItem
              onClick={() => {
                activeEditor.dispatchCommand(
                  INSERT_EXCALIDRAW_COMMAND,
                  undefined,
                );
              }}
              className="item">
              <i className="icon diagram-2" />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Excalidraw</span>
            </DropDownItem>*/}
            <DropDownItem
              onClick={() => {
                showModal('Insert Table', (onClose) => (
                  <InsertTableDialog
                    activeEditor={activeEditor}
                    onClose={onClose}
                  />
                ));
              }}
              className={`${theme.dropdown.item.base}` || "item"}>
              <i className={`${theme.dropdown.item.icon} ${theme.icon.table}` } />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Table</span>
            </DropDownItem>
            {/*<DropDownItem
              onClick={() => {
                showModal('Insert Poll', (onClose) => (
                  <InsertPollDialog
                    activeEditor={activeEditor}
                    onClose={onClose}
                  />
                ));
              }}
              className="item">
              <i className="icon poll" />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Poll</span>
            </DropDownItem>*/}

           {/* <DropDownItem
              onClick={() => {
                showModal('Insert Equation', (onClose) => (
                  <InsertEquationDialog
                    activeEditor={activeEditor}
                    onClose={onClose}
                  />
                ));
              }}
              className="item">
              <i className="icon equation" />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Equation</span>
            </DropDownItem>*/}
            {/*<DropDownItem
              onClick={() => {
                editor.update(() => {
                  const root = $getRoot();
                  const stickyNode = $createStickyNode(0, 0);
                  root.append(stickyNode);
                });
              }}
              className="item">
              <i className="icon sticky" />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Sticky Note</span>
            </DropDownItem> */}
            <DropDownItem
              onClick={() => {
                editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined);
              }}
              className={`${theme.dropdown.item.base}` || "item"}>
              <i className={`${theme.dropdown.item.icon} ${theme.icon.caretRight}`} />
              <span className={`${theme.dropdown.item.text}` ||"text"}>Collapsible container</span>
            </DropDownItem>
            {/*EmbedConfigs.map((embedConfig) => (
              <DropDownItem
                key={embedConfig.type}
                onClick={() => {
                  activeEditor.dispatchCommand(
                    INSERT_EMBED_COMMAND,
                    embedConfig.type,
                  );
                }}
                className="item">
                {embedConfig.icon}
                <span className={`${theme.dropdown.item.text}` ||"text"}>{embedConfig.contentName}</span>
              </DropDownItem>
            )) */}
          </DropDown>
        </>
      )}
      {/* <Divider /> */}
      <div className={theme.toolbar.divider} />
      <ElementFormatDropdown
        disabled={!isEditable}
        value={elementFormat}
        editor={editor}
        isRTL={isRTL}
      />

      {modal}
    </div>
  );
}
