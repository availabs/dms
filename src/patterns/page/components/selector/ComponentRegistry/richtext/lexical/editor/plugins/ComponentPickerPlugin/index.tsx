/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {$createCodeNode} from '@lexical/code';
import {
    INSERT_CHECK_LIST_COMMAND,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode';
import {
    LexicalTypeaheadMenuPlugin,
    MenuOption,
    useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {$createHeadingNode, $createQuoteNode} from '@lexical/rich-text';
import {$setBlocksType} from '@lexical/selection';
import {INSERT_TABLE_COMMAND} from '@lexical/table';
import {
    $createParagraphNode,
    $getSelection,
    $isRangeSelection,
    FORMAT_ELEMENT_COMMAND,
    type LexicalEditor,
    TextNode,
} from 'lexical';
import {useCallback, useMemo, useState} from 'react';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import useModal from '../../hooks/useModal';
import {INSERT_COLLAPSIBLE_COMMAND} from '../CollapsiblePlugin';
import {INSERT_COLLAPSIBLE_NO_PREVIEW_COMMAND} from '../CollapsibleNoPreviewPlugin';
import {InsertButtonDialog} from '../ButtonPlugin';
import {InsertInlineImageDialog} from '../InlineImagePlugin';
import InsertLayoutDialog from '../LayoutPlugin/InsertLayoutDialog';
import {InsertTableDialog} from '../TablePlugin';


class ComponentPickerOption extends MenuOption {
    // What shows up in the editor
    title: string;
    // Icon for display
    icon?: JSX.Element;
    // For extra searching.
    keywords: Array<string>;
    // TBD
    keyboardShortcut?: string;
    // What happens when you select this option?
    onSelect: (queryString: string) => void;

    constructor(
        title: string,
        options: {
            icon?: JSX.Element;
            keywords?: Array<string>;
            keyboardShortcut?: string;
            onSelect: (queryString: string) => void;
        },
    ) {
        super(title);
        this.title = title;
        this.keywords = options.keywords || [];
        this.icon = options.icon;
        this.keyboardShortcut = options.keyboardShortcut;
        this.onSelect = options.onSelect.bind(this);
    }
}

function ComponentPickerMenuItem({
                                     index,
                                     isSelected,
                                     onClick,
                                     onMouseEnter,
                                     option,
                                     theme
                                 }: {
    index: number;
    isSelected: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    option: ComponentPickerOption;
}) {
    let className = `${theme.typeaheadPopover.ul.li.item}` ;
    if (isSelected) {
      className += ` ${theme.typeaheadPopover.ul.li.selected}`;
    }
    return (
        <li
            key={option.key}
            tabIndex={-1}
            className={`${className} ${theme.typeaheadPopover.ul.li.base}`}
            ref={option.setRefElement}
            role="option"
            aria-selected={isSelected}
            id={'typeahead-item-' + index}
            onMouseEnter={onMouseEnter}
            onClick={onClick}>
            {option.icon}
            <span className={theme.typeaheadPopover.ul.li.text}>{option.title}</span>
        </li>
    );
}

function getDynamicOptions(editor: LexicalEditor, queryString: string) {
    const options: Array<ComponentPickerOption> = [];

    if (queryString == null) {
        return options;
    }

    const tableMatch = queryString.match(/^([1-9]\d?)(?:x([1-9]\d?)?)?$/);

    if (tableMatch !== null) {
        const rows = tableMatch[1];
        const colOptions = tableMatch[2]
            ? [tableMatch[2]]
            : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(String);

        options.push(
            ...colOptions.map(
                (columns) =>
                    new ComponentPickerOption(`${rows}x${columns} Table`, {
                        icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.table}`}/>,
                        keywords: ['table'],
                        onSelect: () =>
                            editor.dispatchCommand(INSERT_TABLE_COMMAND, {columns, rows}),
                    }),
            ),
        );
    }

    return options;
}

type ShowModal = ReturnType<typeof useModal>[1];

function getBaseOptions(editor: LexicalEditor, showModal: ShowModal) {
    const theme = editor?._config?.theme || {}
    return [
        new ComponentPickerOption('Paragraph', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.paragraph}`}/>,
            keywords: ['normal', 'paragraph', 'p', 'text'],
            onSelect: () =>
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        $setBlocksType(selection, () => $createParagraphNode());
                    }
                }),
        }),
        ...([1, 2, 3, 4] as const).map(
            (n) =>
                new ComponentPickerOption(`Heading ${n}`, {
                    icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon[`h${n}`]}`}/>,
                    keywords: ['heading', 'header', `h${n}`],
                    onSelect: () =>
                        editor.update(() => {
                            const selection = $getSelection();
                            if ($isRangeSelection(selection)) {
                                $setBlocksType(selection, () => $createHeadingNode(`h${n}`));
                            }
                        }),
                }),
        ),
        new ComponentPickerOption('Table', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.table}`}/>,
            keywords: ['table', 'grid', 'spreadsheet', 'rows', 'columns'],
            onSelect: () =>
                showModal('Insert Table', (onClose) => (
                    <InsertTableDialog activeEditor={editor} onClose={onClose}/>
                )),
        }),
        // ...EmbedConfigs.map(
        //     (embedConfig) =>
        //         new ComponentPickerOption(`Embed ${embedConfig.contentName}`, {
        //             icon: embedConfig.icon,
        //             keywords: [...embedConfig.keywords, 'embed'],
        //             onSelect: () =>
        //                 editor.dispatchCommand(INSERT_EMBED_COMMAND, embedConfig.type),
        //         }),
        // ),
        new ComponentPickerOption('Numbered List', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.number}`}/>,
            keywords: ['numbered list', 'ordered list', 'ol'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
        }),
        new ComponentPickerOption('Bulleted List', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.bullet}`}/>,
            keywords: ['bulleted list', 'unordered list', 'ul'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
        }),
        new ComponentPickerOption('Check List', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.check}`}/>,
            keywords: ['check list', 'todo list'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
        }),
        new ComponentPickerOption('Quote', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.quote}`}/>,
            keywords: ['block quote'],
            onSelect: () =>
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        $setBlocksType(selection, () => $createQuoteNode());
                    }
                }),
        }),
        new ComponentPickerOption('Code', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.code}`}/>,
            keywords: ['javascript', 'python', 'js', 'codeblock'],
            onSelect: () =>
                editor.update(() => {
                    const selection = $getSelection();

                    if ($isRangeSelection(selection)) {
                        if (selection.isCollapsed()) {
                            $setBlocksType(selection, () => $createCodeNode());
                        } else {
                            // Will this ever happen?
                            const textContent = selection.getTextContent();
                            const codeNode = $createCodeNode();
                            selection.insertNodes([codeNode]);
                            selection.insertRawText(textContent);
                        }
                    }
                }),
        }),
        new ComponentPickerOption('Divider', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.horizontalRule}` }/>,
            keywords: ['horizontal rule', 'divider', 'hr'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
        }),
        new ComponentPickerOption('Image', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.image}`}/>,
            keywords: ['image', 'photo', 'picture', 'file'],
            onSelect: () =>
                showModal('Insert Image', (onClose) => (
                    <InsertInlineImageDialog activeEditor={editor} onClose={onClose}/>
                )),
        }),
        new ComponentPickerOption('Collapsible', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.caretRight}`}/>,
            keywords: ['collapse', 'collapsible', 'toggle'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined),
        }),
        new ComponentPickerOption('Collapsible No Preview', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.caretRight}`}/>,
            keywords: ['collapse', 'collapsible', 'toggle'],
            onSelect: () =>
                editor.dispatchCommand(INSERT_COLLAPSIBLE_NO_PREVIEW_COMMAND, undefined),
        }),
        new ComponentPickerOption('Columns Layout', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.columns}`}/>,
            keywords: ['columns', 'layout', 'grid'],
            onSelect: () =>
            showModal('Insert Columns Layout', (onClose) => (
              <InsertLayoutDialog activeEditor={editor} onClose={onClose} />
            )),
        }),
        new ComponentPickerOption('Button', {
            icon: <i className={`${theme.typeaheadPopover.ul.li.icon} ${theme.icon.columns}`}/>,
            keywords: ['button'],
            onSelect: () =>
            showModal('Insert Button', (onClose) => (
              <InsertButtonDialog activeEditor={editor} onClose={onClose} />
            )),
        }),
        ...(['left', 'center', 'right', 'justify'] as const).map(
            (alignment) =>
                new ComponentPickerOption(`Align ${alignment}`, {
                    icon: <i className={`icon ${alignment}-align`}/>,
                    keywords: ['align', 'justify', alignment],
                    onSelect: () =>
                        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment),
                }),
        ),
    ];
}

export default function ComponentPickerMenuPlugin(): JSX.Element {
    const [editor] = useLexicalComposerContext();
    const [modal, showModal] = useModal();
    const [queryString, setQueryString] = useState<string | null>(null);
    const theme = editor?._config?.theme || {}

    const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
        minLength: 0,
    });

    const options = useMemo(() => {
        const baseOptions = getBaseOptions(editor, showModal);

        if (!queryString) {
            return baseOptions;
        }

        const regex = new RegExp(queryString, 'i');

        return [
            ...getDynamicOptions(editor, queryString),
            ...baseOptions.filter(
                (option) =>
                    regex.test(option.title) ||
                    option.keywords.some((keyword) => regex.test(keyword)),
            ),
        ];
    }, [editor, queryString, showModal]);

    const onSelectOption = useCallback(
        (
            selectedOption: ComponentPickerOption,
            nodeToRemove: TextNode | null,
            closeMenu: () => void,
            matchingString: string,
        ) => {
            editor.update(() => {
                nodeToRemove?.remove();
                selectedOption.onSelect(matchingString);
                closeMenu();
            });
        },
        [editor],
    );

    return (
        <>
            {modal}
            <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
                onQueryChange={setQueryString}
                onSelectOption={onSelectOption}
                triggerFn={checkForTriggerMatch}
                options={options}
                menuRenderFn={(
                    anchorElementRef,
                    {selectedIndex, selectOptionAndCleanUp, setHighlightedIndex},
                ) =>
                    anchorElementRef.current && options.length
                        ? ReactDOM.createPortal(
                            <div className={`${theme.typeaheadPopover.base} ${theme.componentPickerMenu}`}>
                                <ul>
                                    {options.map((option, i: number) => (
                                        <ComponentPickerMenuItem
                                            index={i}
                                            isSelected={selectedIndex === i}
                                            theme={theme}
                                            onClick={() => {
                                                setHighlightedIndex(i);
                                                selectOptionAndCleanUp(option);
                                            }}
                                            onMouseEnter={() => {
                                                setHighlightedIndex(i);
                                            }}
                                            key={option.key}
                                            option={option}
                                        />
                                    ))}
                                </ul>
                            </div>,
                            anchorElementRef.current,
                        )
                        : null
                }
            />
        </>
    );
}