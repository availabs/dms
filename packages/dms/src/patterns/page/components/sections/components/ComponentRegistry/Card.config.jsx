import React, { useContext, useState } from 'react'
import { CardSection } from './Card'
import { ThemeContext, getComponentTheme } from '../../../../../../ui/useTheme'
import ColorControls from './sharedControls/ColorControls'
import columnTypes from '../../../../../../ui/columnTypes'

// Build the header/value font-style options dynamically from the resolved
// `textSettings` theme block. Card.jsx applies the chosen value as a class via
// `theme[attr.valueFontStyle]` (see Card.jsx ~line 477) where `theme` is the
// merged textSettings + dataCard style — so every key in `theme.textSettings`
// is a legal value here. Hand-curating this list (the previous behaviour)
// silently dropped theme-defined keys like `h1..h6`, `body`, `caption`, etc.,
// even though Card.jsx happily applied them at render time.
//
// `name` is filtered out — that's the style identifier, not a class string.
const buildFontStyleOptions = (theme) => {
    const ts = getComponentTheme(theme || {}, 'textSettings') || {};
    const keys = Object.keys(ts).filter(k => k !== 'name' && k !== 'options');
    return [
        { label: '', value: '' },
        ...keys.map(k => ({ label: k, value: k })),
    ];
};

// Per-section "Card style" picker — mirror of FilterComponent's `display.filterStyle`
// and Spreadsheet's `display.tableStyle`. Options come from `theme.dataCard.styles` so
// adding a new named style in the brand theme surfaces it in the toolbar with no code
// change. Empty value = the theme's `theme.dataCard.options.activeStyle`.
const buildCardStyleOptions = (theme) => {
    const styles = theme?.dataCard?.styles || [];
    return [{ label: '(theme default)', value: '' }, ...styles.map(s => ({ label: s.name, value: s.name }))];
};

const handleCopy = async (obj) => {
    try {
        const text = JSON.stringify(obj, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            throw new Error('Error copying format')
        }
    } catch (err) {
        console.error("Failed to copy:", err);
    }
};

const handlePaste = async (attribute, setAttribute) => {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const obj = await navigator.clipboard.readText();
            const parsedObj = JSON.parse(obj);
            const {
                justify = '',
                headerJustify = '',
                headerCase = '',
                formatFn = '',
                headerFontStyle = '',
                valueFontStyle = '',
                hideHeader = false,
                hideValue = false,
                wrapText = false,
            } = parsedObj;
            // Accept both new (cellSpan/cellRowSpan/cellBgColor) and legacy
            // (cardSpan/cardRowSpan/bgColor) clipboard payloads — the
            // Spreadsheet section still copies the legacy keys, so this
            // keeps cross-section paste working.
            const cellSpan = parsedObj.cellSpan ?? parsedObj.cardSpan ?? '';
            const cellRowSpan = parsedObj.cellRowSpan ?? parsedObj.cardRowSpan ?? '';
            const cellBgColor = parsedObj.cellBgColor ?? parsedObj.bgColor ?? '';
            // Accent (left) border colour — new-only key (no legacy predecessor).
            const cellBorderColor = parsedObj.cellBorderColor ?? '';

            const newAttribute = {
                ...attribute,
                justify, headerJustify, headerCase, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue,
                cellSpan, cellRowSpan, cellBgColor, cellBorderColor, wrapText,
            }
            return setAttribute(newAttribute)
        } else {
            throw new Error('Error pasting format')
        }
    } catch (e) {
        console.error("Failed to paste:", e)
    }
}

// `buildInHeader(fontStyleOptions)` produces the per-column toolbar entries.
// Wrapped in a function so the font-style options (sourced from theme.textSettings)
// can be injected at controls() resolution time.
const buildInHeader = (fontStyleOptions) => [
    // settings from in header dropdown are stored in the columns array per column.
    { type: ({ attribute, setAttribute, moveColumn, removeColumn, close }) => {
            const { UI } = useContext(ThemeContext);
            const { Pill, Icon } = UI;
            const [copied, setCopied] = useState(false);
            const {
                justify, headerJustify, headerCase, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue,
                cellBgColor, cellBorderColor, cellSpan, cellRowSpan, wrapText
            } = attribute;
            const objToCopy = {
                justify, headerJustify, headerCase, formatFn, headerFontStyle, valueFontStyle, hideHeader, hideValue,
                cellBgColor, cellBorderColor, cellSpan, cellRowSpan, wrapText
            };

            return (
                <div className={'w-full flex justify-between gap-1'}>
                    <div className={'flex gap-1'}>
                        <Pill color={'blue'} text={<Icon icon={'ChevronUpSquare'} className={'size-5'} />} title={'Move Up'}
                              onClick={() => moveColumn(-1)} />
                        <Pill color={'blue'} text={<Icon icon={'ChevronDownSquare'} className={'size-5'} />} title={'Move Down'}
                              onClick={() => moveColumn(1)} />
                        <Pill color={copied ? 'green' : 'blue'} text={<Icon icon={'Copy'} className={'size-5'} />}
                              title={'Copy Format'}
                              onClick={() => {
                                  handleCopy(objToCopy);
                                  setCopied(true);
                                  setTimeout(() => setCopied(false), 2000);
                              }} />
                        <Pill color={'blue'} text={<Icon icon={'Paste'} className={'size-5'} />} title={'Paste Format'}
                              onClick={() => handlePaste(attribute, setAttribute)} />
                    </div>

                    <div className={'flex gap-1'}>
                        <Pill color={'orange'} text={<Icon icon={'TrashCan'} className={'size-5'} />} title={'Remove'}
                              onClick={removeColumn} />
                        <Pill color={'orange'} text={<Icon icon={'CancelCircle'} className={'size-5'} />} title={'Close'}
                              onClick={close} />
                    </div>
                </div>
            );
        },
        label: 'column actions', key: '', hideFromSectionMenu: true, displayCdn: ({ isEdit }) => isEdit,
        renderPos: 'top', renderCdn: activeParent => !activeParent
    },
    { type: ({ close, goBack, goHome }) => {
            const { UI } = useContext(ThemeContext);
            const { Pill, Icon } = UI;
            return (
                <div className={'w-full flex justify-between gap-1'}>
                    <div className={'flex gap-1'}>
                        <Pill color={'blue'} text={<Icon icon={'ArrowLeft'} className={'size-5'} />} title={'Back'} onClick={goBack} />
                        <Pill color={'blue'} text={<Icon icon={'Home'} className={'size-5'} />} title={'Home'} onClick={goHome} />
                    </div>
                    <Pill color={'orange'} text={<Icon icon={'CancelCircle'} className={'size-5'} />} title={'Close'}
                          onClick={close} />
                </div>
            );
        },
        label: 'column sub actions', key: '', hideFromSectionMenu: true,
        renderPos: 'top', renderCdn: activeParent => !!activeParent
    },
    { type: 'separator', key: 'toolbar-sep', label: 'toolbar-sep', hideFromSectionMenu: true,
      renderPos: 'top', renderCdn: () => true },

    // column type — reads the live ColumnTypes registry so theme-registered
    // types (registered via theme.columnTypes) appear alongside built-ins.
    { type: 'select', label: 'Column Type', key: 'type',
        options: () => Object.keys(columnTypes)
            .filter(name => name !== 'default')
            .map(name => ({ label: name, value: name })),
        displayCdn: ({ isEdit }) => isEdit
    },
    // Column-type style: forwarded to the columnType as its `activeStyle`, selecting a
    // named style from that type's theme (e.g. a `multiselect` "field" / "compact" style
    // for a select cell). Free text so any theme style name works; blank = the type's
    // default style. Flows via `{...attributeProps}` in Card.jsx / TableCell.jsx.
    { type: 'input', label: 'Column Type Style', key: 'activeStyle', isBatchUpdatable: true,
        displayCdn: ({ isEdit }) => isEdit },

    // display
    { type: 'select', label: 'Justify', key: 'justify', isBatchUpdatable: true,
        options: [
            { label: 'Not Justified', value: '' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
            { label: 'Full Justified', value: 'full' }
        ]
    },
    // Header alignment — independent of value `justify` (which aligns the value).
    // Default '' → left, preserving prior behavior (the header always rendered left).
    { type: 'select', label: 'Header Justify', key: 'headerJustify', isBatchUpdatable: true,
        displayCdn: ({ attribute }) => !attribute.hideHeader,
        options: [
            { label: 'Left (default)', value: '' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
        ]
    },
    { type: 'select', label: 'Format', key: 'formatFn', isBatchUpdatable: true,
        options: [
            { label: 'No Format Applied', value: ' ' },
            { label: 'Comma Separated', value: 'comma' },
            { label: 'Comma Separated ($)', value: 'comma_dollar' },
            { label: 'Percent (append %)', value: 'percent' },
            { label: 'Abbreviated', value: 'abbreviate' },
            { label: 'Abbreviated ($)', value: 'abbreviate_dollar' },
            { label: 'Date', value: 'date' },
            { label: 'Time (HH:MM am/pm)', value: 'time' },
            { label: 'Date + Time', value: 'datetime' },
            { label: 'Title', value: 'title' },
            { label: 'Icon', value: 'icon' },
            { label: 'Color', value: 'color' },
            { label: 'Combine columns', value: 'combine' },
        ]
    },
    // `combine` formatFn: renders `<value><separator><row[combineWith]>` in one
    // cell. The sibling column must still be `show: true` somewhere on the card
    // so the data loader fetches it.
    { type: 'input', inputType: 'text', label: 'Combine With', key: 'combineWith', isBatchUpdatable: true,
        displayCdn: ({ attribute, isEdit }) => isEdit && attribute.formatFn === 'combine' },
    { type: 'input', inputType: 'text', label: 'Separator', key: 'combineSeparator', isBatchUpdatable: true,
        displayCdn: ({ attribute, isEdit }) => isEdit && attribute.formatFn === 'combine' },
    { type: 'select', label: 'Header', key: 'headerFontStyle', options: fontStyleOptions, isBatchUpdatable: true, displayCdn: ({ attribute }) => !attribute.hideHeader },
    // Header casing — default '' = as-authored (no transform). The Card no longer
    // force-capitalizes headers; authors opt into a transform here.
    { type: 'select', label: 'Header Case', key: 'headerCase', isBatchUpdatable: true,
        displayCdn: ({ attribute }) => !attribute.hideHeader,
        options: [
            { label: 'As authored', value: '' },
            { label: 'Capitalize', value: 'capitalize' },
            { label: 'UPPERCASE', value: 'uppercase' },
            { label: 'lowercase', value: 'lowercase' },
        ]
    },
    { type: 'select', label: 'Value', key: 'valueFontStyle', options: fontStyleOptions, isBatchUpdatable: true, displayCdn: ({ attribute }) => !attribute.hideValue },

    { type: 'separator', key: 'toolbar-sep', label: 'toolbar-sep', hideFromSectionMenu: true },
    // layout — all per-cell controls always visible (no mode gating)
    { type: 'toggle', label: 'Border Below', key: 'cellBorderBelow' },
    // Per-cell padding overrides — side-specific wins over `cellPadding`,
    // `cellPadding` wins over section-level `cellsPadding`.
    { type: 'input', inputType: 'number', label: 'Padding', key: 'cellPadding', isBatchUpdatable: true },
    { type: 'input', inputType: 'number', label: 'Padding Top', key: 'cellPaddingTop', isBatchUpdatable: true },
    { type: 'input', inputType: 'number', label: 'Padding Right', key: 'cellPaddingRight', isBatchUpdatable: true },
    { type: 'input', inputType: 'number', label: 'Padding Below', key: 'cellPaddingBottom', isBatchUpdatable: true },
    { type: 'input', inputType: 'number', label: 'Padding Left', key: 'cellPaddingLeft', isBatchUpdatable: true },
    { type: 'toggle', label: 'Hide Header', key: 'hideHeader', isBatchUpdatable: true },
    // hideValue is DEPRECATED as an authoring surface — one visibility axis:
    // `show` (fetch + render), `selectOnly` (fetch only), `hideHeader`
    // (header is real chrome). The renderer keeps honoring hideValue for
    // existing cards; the toggle only appears when it's already set, so
    // authors can turn it off but not adopt it.
    { type: 'toggle', label: 'Hide Value (deprecated — use Select Only)', key: 'hideValue', isBatchUpdatable: true,
        displayCdn: ({ attribute }) => !!attribute.hideValue },
    { type: 'toggle', label: 'Select Only (no cell)', key: 'selectOnly', isBatchUpdatable: true },
    { type: 'input', inputType: 'number', label: 'Col Span', key: 'cellSpan' },
    { type: 'input', inputType: 'number', label: 'Row Span', key: 'cellRowSpan' },
    // Cell Width — per-column grid track size. Accepts:
    //   ''            → fluid (track stays minmax(0, 1fr), matches the row default)
    //   'auto'        → track shrinks to fit the cell's natural content
    //   '<N>px' / etc → fixed CSS size; first column to claim a track wins it.
    // See src/dms/skills/card-layout.md → "Sizing tracks (fluid / content / fixed)".
    { type: 'input', inputType: 'text', label: 'Cell Width', key: 'cellWidth' },
    { type: 'separator', key: 'toolbar-sep', label: 'toolbar-sep', hideFromSectionMenu: true },
    // other
    { type: 'toggle', label: 'Allow Edit', key: 'allowEditInView', displayCdn: ({ isEdit }) => isEdit },

    // richtext (lexical) controls — only visible when this column's type is lexical
    { type: 'toggle', label: 'Show Toolbar', key: 'showToolbar',
      displayCdn: ({ attribute, isEdit }) => isEdit && attribute.type === 'lexical' },

    // link controls
    { type: 'toggle', label: 'Is Link', key: 'isLink', displayCdn: ({ isEdit }) => isEdit },
    { type: 'toggle', label: 'Is External', key: 'isLinkExternal', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
    { type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
    { type: 'input', inputType: 'text', label: 'Location', key: 'location', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
    { type: 'select', label: 'Search Params', key: 'searchParams', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink,
        options: [
            { label: 'None', value: undefined },
            { label: 'ID', value: 'id' },
            { label: 'Value', value: 'value' },
            { label: 'Raw Value', value: 'rawValue' }
        ]
    },
    { type: 'toggle', label: 'Persist Search Params', key: 'persistSearchParams', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },
    // Active on Search Param: when on, this link cell parses its own `location`
    // query params and applies the theme's `cellActive` style whenever the page's
    // live filters already match them (empty/`?` location = active when none of the
    // sibling active cells' param keys are set — the "All" state). Default off → BC.
    { type: 'toggle', label: 'Active on Search Param', key: 'activeOnSearchParam', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.isLink },

    // The legacy `Is Image` / `Image Url` / `Image Location` / `Image Extension`
    // controls have been retired from the editor — new cards should use the
    // dedicated `image` column type instead. Card.jsx still honors the
    // `attr.isImg` flag at render time, so existing text-as-image columns
    // keep rendering identically; they just can't be reconfigured through
    // the menu. To edit, convert the column type to `image`.

    // image-column controls — same size set as the legacy isImg path.
    // `defaultImage` is shown when the row's value is empty.
    { type: 'input', inputType: 'text', label: 'Default Image URL', key: 'defaultImage', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.type === 'image' },
    { type: 'select', label: 'Image Size', key: 'imageSize',
        options: [
            { label: 'X-Small', value: 'imgXS' },
            { label: 'Small', value: 'imgSM' },
            { label: 'Base', value: 'imgMD' },
            { label: 'XL', value: 'imgXL' },
            { label: '2XL', value: 'img2XL' },
            { label: '3XL', value: 'img3XL' },
            { label: '4XL', value: 'img4XL' },
            { label: '5XL', value: 'img5XL' },
            { label: '6XL', value: 'img6XL' },
            { label: '7XL', value: 'img7XL' },
            { label: '8XL', value: 'img8XL' },
        ],
        displayCdn: ({ attribute, isEdit }) => isEdit && attribute.type === 'image'
    },
    { type: 'input', inputType: 'number', label: 'Image Top Margin', key: 'imageMargin', displayCdn: ({ attribute, isEdit }) => isEdit && attribute.type === 'image' },
    { type: 'select', label: 'Sort', key: 'sort',
        options: [
            { label: 'Not Sorted', value: '' }, { label: 'A->Z', value: 'asc nulls last' }, { label: 'Z->A', value: 'desc nulls last' }
        ]
    },
    { type: 'textarea', label: 'Description', key: 'description', displayCdn: ({ isEdit }) => isEdit },
    { type: ({ value, setValue }) => (<ColorControls value={value} setValue={setValue} title={'Background Color'} />), key: 'cellBgColor' },
    // Sibling of Background Color — sets a coloured LEFT accent border on the cell
    // (stat-strip look). Applied in resolveCellStyle (Card.layout.js) next to
    // cellBgColor. Unset → no border → BC.
    { type: ({ value, setValue }) => (<ColorControls value={value} setValue={setValue} title={'Accent Border Color'} />), key: 'cellBorderColor' },

    // Empty Default — per-column placeholder used by getData.js's blank-row
    // fallback (only when `display.useBlankRowFallback` is on for the section).
    // Mounts the column type's existing EditComp bound to `attribute.blankDefault`,
    // so every column type (text, textarea, portrait_banner, image, calc text, …)
    // gets a type-appropriate authoring widget for free — no per-type-special-cased
    // UI to maintain. For calc columns the user types the literal final value;
    // no SQL re-evaluation in fallback mode.
    //
    // Gated on `display.useBlankRowFallback === true && isEdit` so the toolbar
    // stays uncluttered for sections that haven't opted in.
    { type: ({ attribute, setAttribute }) => {
            const ColType = columnTypes[attribute?.type] || columnTypes.default;
            const Edit = ColType?.EditComp;
            if (!Edit) return null;
            // Render the label inline — function-typed controls don't get
            // an auto-rendered label from the consumer (sectionMenu /
            // ColumnManager just call the function and use its output as-is),
            // so we wrap the EditComp in our own label container that
            // matches the toggle/select/input styling.
            return (
                <div className="flex flex-col gap-0.5">
                    <label className="text-xs text-gray-600">Empty Default</label>
                    <Edit
                        value={attribute?.blankDefault}
                        onChange={v => setAttribute({ ...attribute, blankDefault: v })}
                        placeholder={'Empty-state default'}
                        className={'w-full'}
                    />
                </div>
            );
        },
        label: 'Empty Default', key: 'blankDefault',
        displayCdn: ({ display, isEdit }) => isEdit && display?.useBlankRowFallback === true,
    },
];

export const componentFunctions = {
    providers: [
        {
            id: 'hover_highlight',
            label: 'Hover: Publish Row',
            description: 'On hover, publishes a column value to a page action param. Clears on mouse leave.',
            trigger: 'hover',
            args: [
                { key: 'column', label: 'Column to publish', type: 'column-select' },
            ],
        },
        {
            id: 'click_publish',
            label: 'Click: Publish Column',
            description: 'On click of a specific column cell, publishes that column\'s value to a page action param.',
            trigger: 'click',
            args: [
                { key: 'column', label: 'Column to publish on click', type: 'column-select' },
            ],
        },
        {
            id: 'add_publish',
            label: 'Add: Publish Created Row',
            description: 'After a successful Add New create, publishes the new row id to a page action param — pair with a Refetch Data subscriber so other sections over the same source update without a reload.',
            trigger: 'add',
            args: [],
        },
    ],
    subscribers: [
        {
            id: 'data_refresh',
            label: 'Refetch Data on Param Change',
            description: 'Refetches this section\'s data whenever the subscribed action param\'s value changes (e.g. an Add: Publish Created Row provider fired). Requires fetch mode smart/force.',
            trigger: 'action_param',
            args: [],
        },
        {
            id: 'row_highlight',
            label: 'Highlight Matching Card',
            description: 'Highlights card items whose column value matches an incoming action param.',
            trigger: 'action_param',
            args: [
                { key: 'column', label: 'Column to match', type: 'column-select' },
                {
                    key: 'style',
                    label: 'Highlight style',
                    type: 'select',
                    options: [
                        { label: 'Background', value: 'bg' },
                        { label: 'Border', value: 'border' },
                    ],
                },
            ],
        },
        {
            id: 'click_save',
            label: 'Click: Save All Edited Rows',
            description: 'When the subscribed action param fires, auto-saves all rows in form-edit mode. Only activates when Allow Edit is on.',
            trigger: 'action_param',
            args: [],
        },
    ],
};

// Build per-column-type controls from the column types registry. Each
// registered column type may declare a `cardControls: [...]` array of extra
// toolbar entries (e.g. portrait_banner's `bannerHeight` select). We resolve
// the registry **at call time** (controls is a function — see below) so theme-
// registered types added during site boot are picked up.
//
// Each entry is auto-scoped to `isEdit && attribute.type === <typeName>`;
// if the author also supplied a displayCdn it's AND-ed with the auto gate.
const deriveColumnTypeInHeaderEntries = () =>
    Object.entries(columnTypes).flatMap(([typeName, def]) =>
        (def?.cardControls || []).map(ctrl => {
            const userCdn = ctrl.displayCdn;
            return {
                ...ctrl,
                displayCdn: (ctx) => {
                    if (!ctx?.isEdit) return false;
                    if (ctx?.attribute?.type !== typeName) return false;
                    return userCdn ? userCdn(ctx) : true;
                },
            };
        })
    );

// `controls` is a function so the column-type-driven inHeader entries and
// the theme-derived font-style options are resolved at consumer time:
//   - column types may be theme-registered during pagesConfig() at site boot,
//     after this module loads — a static spread would snapshot only built-ins.
//   - the textSettings keys live on the resolved theme; we read them via
//     `getComponentTheme(theme, 'textSettings')` so any key the renderer can
//     apply (h1..h6, body, caption, plus the textXS..text8XL ramp) appears
//     as a selectable option.
const buildControls = (theme) => ({
        columns: [
            { type: 'toggle', label: 'show', key: 'show' },
            { type: 'toggle', label: 'Group', key: 'group' },
            { type: 'select', label: 'Fn', key: 'fn',
                options: [
                    { label: 'list', value: 'list' }, { label: 'sum', value: 'sum' }, { label: 'count', value: 'count' }, { label: 'avg', value: 'avg' }, { label: 'fn exempt', value: 'exempt' }
                ]
            },
            { type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    { label: 'include n/a', value: false }, { label: 'exclude n/a', value: true }
                ]
            },
        ],
        more: [
            { type: 'select', label: 'Card style', key: 'cardStyle',
                options: buildCardStyleOptions(theme) },
            // Cards grid: how record-cards are laid out across the section.
            { label: 'Cards Grid', items: [
                    { type: 'input', inputType: 'number', label: 'Cards Across', key: 'cardsGridSize' },
                    { type: 'input', inputType: 'number', label: 'Gap', key: 'cardsGridGap' },
                    { type: 'input', inputType: 'number', label: 'Card Padding', key: 'cardsPadding' },
                    // Padding on the whole cards grid (vs Card Padding = inside each
                    // card). Number or CSS shorthand, e.g. '0 0 16px' for bottom-only.
                    { type: 'input', label: 'Grid Padding', key: 'cardsGridPadding' },
                    // 'Fill height' stretches card rows to the section box (gaps breathe
                    // with the section height); 'Pack to top' keeps rows content-sized so
                    // the vertical gap is exactly `cardsGridGap`. Model default: v1 themes
                    // fill, `layoutModel: 'v2'` themes pack — set an explicit value to
                    // override either way.
                    { type: 'select', label: 'Vertical Align', key: 'cardsVerticalAlign',
                        options: [
                            { label: 'Model default (v1 fill / v2 pack)', value: undefined },
                            { label: 'Pack to top', value: 'top' },
                            { label: 'Fill height', value: 'stretch' },
                        ],
                    },
                    { type: ({ value, setValue }) => <ColorControls value={value} setValue={setValue} title={'Card Background'} />, key: 'cardsBgColor' },
                    { type: 'toggle', label: 'Card Border', key: 'cardBorder' },
                ]
            },
            // Cells grid: how attribute-cells are laid out inside each card.
            { label: 'Cells Grid', items: [
                    { type: 'input', inputType: 'number', label: 'Cells Across', key: 'cellsGridSize' },
                    { type: 'input', inputType: 'number', label: 'Gap', key: 'cellsGridGap' },
                    // Per-axis gap overrides (win over the single Gap) — tighten the vertical rhythm
                    // without squishing a packed row, or vice-versa.
                    { type: 'input', inputType: 'number', label: 'Row Gap', key: 'cellsRowGap' },
                    { type: 'input', inputType: 'number', label: 'Col Gap', key: 'cellsColumnGap' },
                    { type: 'input', inputType: 'number', label: 'Row Height', key: 'cellsRowHeight' },
                    { type: 'input', inputType: 'number', label: 'Cell Padding', key: 'cellsPadding' },
                    { type: 'toggle', label: 'Cell Border', key: 'cellBorder' },
                    // Track Template — raw grid-template-columns string, wins over
                    // per-column `cellWidth`. Power-user escape hatch.
                    { type: 'input', inputType: 'text', label: 'Track Template', key: 'cellsTracksTemplate' },
                ]
            },
            { label: 'Default Column Settings', items: [
                    { type: 'select', label: 'Value Placement', key: 'headerValueLayout', onClickGoBack: true, defaultValue: 'row', options: [{ label: 'Inline', value: 'row' }, { label: 'Stacked', value: 'col' }] },
                    { type: 'toggle', label: 'Reverse Placement', key: 'reverse', displayCdn: ({ display }) => display.headerValueLayout === 'col' },
                    { type: 'input', inputType: 'number', label: 'Header Width', key: 'headerWidth', displayCdn: ({ display }) => !display.headerValueLayout || display.headerValueLayout === 'row' },
                    { type: 'input', inputType: 'number', label: 'Value Width', key: 'valueWidth', displayCdn: ({ display }) => !display.headerValueLayout || display.headerValueLayout === 'row' },
                ]
            },
            { type: 'toggle', label: 'Attribution', key: 'showAttribution' },
            { type: 'toggle', label: 'Hide if No Data', key: 'hideIfNull' },
            { type: 'toggle', label: 'Use Pagination', key: 'usePagination' },
            { type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize', displayCdn: ({ display }) => display.usePagination === true },
        ],
        data: [
            { type: 'toggle', label: 'Allow Edit', key: 'allowEditInView',
                onChange: ({ value, state }) => {
                    // if editing data is allowed, data should not be cached. unless live edit is used.
                    if (value) state.display.readyToLoad = true
                }
            },
            { type: 'toggle', label: 'Live Edit', key: 'liveEdit', displayCdn: ({ display }) => display.allowEditInView },
            { type: 'toggle', label: 'Allow Add New', key: 'allowAdddNew' },
            { type: 'select', label: 'Add New Behaviour', key: 'addNewBehaviour', displayCdn: ({ display }) => display.allowAdddNew,
                options: [
                    { label: 'Append Entry', value: 'append' },
                    { label: 'Clear Form', value: 'clear' },
                    { label: 'Navigate', value: 'navigate' },
                ]
            },
            { type: 'input', inputType: 'text', label: 'Navigate to', key: 'navigateUrlOnAdd',
                displayCdn: ({ display }) => display.allowAdddNew && display.addNewBehaviour === 'navigate' },
            // for add-forms living in a modal section-group: name the group's modalParamKey and a
            // successful add clears it, closing the modal (see skills/modal-section-group.md)
            { type: 'input', inputType: 'text', label: 'Close modal on add (param key)', key: 'closeModalOnAdd',
                displayCdn: ({ display }) => display.allowAdddNew },
            { type: 'select', label: 'Data Fetch Mode', key: 'fetchMode',
              options: [
                { label: 'Cache (use preloaded data)', value: 'cache' },
                { label: 'Smart (fetch on change)',    value: 'smart' },
                { label: 'Force (always re-fetch)',    value: 'force' },
              ]
            },
            // Empty-result fallback. When on AND the query returns 0 rows,
            // getData.js synthesizes a single row from each column's
            // `blankDefault` (per-column toolbar control, gated on this flag).
            // Default off → existing sections behave exactly as before.
            // See dataWrapper/getData.js tail for the synthesis branch.
            { type: 'toggle', label: 'Render Blank Row When Empty', key: 'useBlankRowFallback' },
        ],
        inHeader: [...buildInHeader(buildFontStyleOptions(theme)), ...deriveColumnTypeInHeaderEntries()]
});

export default {
    "name": 'Card',
    "type": 'card',
    useDataSource: true,
    useDataWrapper: true,
    useGetDataOnPageChange: true,
    useInfiniteScroll: false,
    showPagination: true,
    keepOriginalValues: true,
    showAllColumnsControl: false,
    usesItemMutationProps: true,
    themeKey: 'dataCard',
    defaultState: {
        filters: { op: 'AND', groups: [] },
        display: { usePagination: true, pageSize: 5, hideExternalToggle: true },
        columns: [],
        data: [],
        externalSource: { columns: [] }
    },
    controls: buildControls,
    componentFunctions,
    "EditComp": CardSection,
    "ViewComp": CardSection,
}
