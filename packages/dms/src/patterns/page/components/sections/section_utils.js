import {convert} from './convertToSpreadSheet'
import {v4 as uuidv4} from "uuid";

export const handlePaste = async (e, setKey, setState, value, onChange) => {
    e.preventDefault();
    try {
        const text = await navigator.clipboard.readText();
        const copiedValue = isJson(text) && JSON.parse(text || '{}');

        if (!copiedValue || !copiedValue['element']?.['element-type']) return;
        const elementData = copiedValue['element']['element-data'];
        setKey(copiedValue['element']['element-type']) // mainly for lexical so it updates with value
        setState(isJson(elementData) ? JSON.parse(elementData) : elementData) // state inits with element-data from prop. need to update on paste.
        const pastedValue = {}

        Object.keys(copiedValue)
            .filter(key => !['id', 'ref'].includes(key))
            .map(key => {
                pastedValue[key] = copiedValue[key]
            })

        onChange({...value, ...pastedValue});
    } catch (e) {
        console.error('<paste>', e)
    }
}

export const getHelpTextArray = (value, isEdit) => {
  const helpText = Array.isArray(value?.['helpText']) ?
      value?.['helpText'] :
      value?.['helpText']?.text ?
          [value?.['helpText']] :
          value?.helpText ?
              [{text: value?.['helpText']}] :
              [];

  return isEdit ? helpText : helpText.filter(({visibility}) => visibility !== 'edit')
}

export const isJson = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const handleCopyToClipboard = (value) => {
    navigator.clipboard.writeText(value)
}

export const handleCopy = (value) => {
    const elementType = value?.element?.['element-type'];
    //--------------------------------------
    // Temp Code to migrate off cenrep II
    //--------------------------------------
    if (elementType === 'Table: Cenrep II') {
        const spreadsheetData = convert(JSON.parse(value.element['element-data']));
        const ssElement = {
            ...value,
            element: {'element-type': 'Spreadsheet', 'element-data': JSON.stringify(spreadsheetData)}
        };
        console.log(ssElement);
       handleCopyToClipboard(JSON.stringify(ssElement))
        return;
    }

    handleCopyToClipboard(JSON.stringify(value))
}

export const initialState = defaultState => {
    if(defaultState && Object.keys(defaultState).length) return defaultState;

    return {
        // user controlled part
        columns: [
            //     visible columns or Actions
            //     {name, display_name, custom_name,
            //      justify, width, fn,
            //      groupBy: t/f, orderBy: t/f, excludeNull: t/f, openOut: t/f,
            //      formatFn, fontSize, hideHeader, cardSpan,
            //      isLink: t/f, linkText: ‘’, linkLocation: ‘’, actionName, actionType, icon,
            //      }
        ],
        display: {
            usePageFilters: false,
            usePagination: true,
            pageSize: 5,
            totalLength: 0,
            showGutters: false,
            transform: '', // transform fn to be applied
            loadMoreId:`id${uuidv4()}`,
            showAttribution: true,
        },
        // wrapper controlled part
        filters: { op: 'AND', groups: [] },
        // lastDataRequest: {},
        data: [],
        externalSource: {
            columns: [],
            // pgEnv,
            // source_id
            // view_id
            // version,
            // doc_type, type -- should be the same
        }
    }
}

// ── Section header band tokens ───────────────────────────────────────────────
// Every class in this band used to be hardcoded, so no theme could reach it: a fixed 50px row,
// `font-display font-medium uppercase`, and a title class of `w-full ${theme.heading[level]}`.
// These tokens (theme `pages.section`) open it up WITHOUT changing anything for a theme that
// sets none of them — each default below is the literal string this component emitted before
// the tokens existed, down to the trailing space in the title class and the `undefined` a
// missing `theme.heading` produces. That is not pedantry: 154,632 MitigateNY component rows
// render a title through here and none of them will ever set one of these. The exact markup is
// locked in tests/viewSectionHeaderLegacy.test.js against goldens captured from the pre-token
// code — a diff there means an existing site's pages changed.
//
// `??` rather than `||` throughout, so a theme can deliberately set a token to "" (e.g. to
// remove the band's padding) instead of silently getting the default back.
export const HEADER_DEFAULTS = {
    headerRow:      'flex w-full min-h-[50px] items-center pb-2',
    headerInner:    'flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center',
    headerTitleWrap:'flex-1',
    headerActions:  'flex item-center h-full pointer-events-auto',
    // Unset by default, and BOTH are opt-in by the theme rather than by the data:
    //  • headerTitle  — appended AFTER the historical `w-full ${heading}` string, never replacing it.
    //  • headerKicker — the right-hand meta line, rendered from the section's own `description`
    //    attribute. That attribute has been registered in page.format.js for years with no render
    //    path at all (measured 2026-09-11: zero sections carry a value, site-wide), so giving it
    //    one cannot surface text an author never expected to see. Gated on the TOKEN, not on the
    //    value, so a site that later fills a description still shows nothing until it opts in.
    headerTitle:  '',
    headerKicker: '',
    // When a theme registers sectionHeaderExtensions (see sectionHeaderExtensions.js), they
    // render on their own row BELOW this band by default. `headerExtensionsInline` moves them
    // into the band itself, sharing the row with the title — the graph-card header shape, where
    // the title, the measure pills and the settings kebab are one 40px line.
    //
    // The kicker and the extensions SHARE that right-hand slot rather than one suppressing the
    // other. An earlier version hid the kicker whenever `headerExtensions` was non-empty, which
    // looked right and was wrong: an extension builder returns a React node whose component may
    // then render `null` (npmrds' Quick Controls do exactly that outside page-edit mode), so
    // array length says nothing about whether anything is actually drawn — the kicker vanished
    // on every report card in view mode, which is the one mode it exists for. A theme that wants
    // the kicker to yield on a narrow card does it in the token, with a breakpoint.
    headerExtensionsInline: false,
    headerExtensionsInlineRow: 'shrink-0 flex items-center gap-1.5',
    // Per-level title classes; '' ⇒ the site-wide `theme.heading[level]` lookup (historical).
    headerTitleLevels: '',
    // Tags + help-text triggers and their popups — the historical hardcoded literals.
    tagButton:  'p-2 border border-[#E0EBF0] rounded-full print:hidden',
    tagIcon:    'text-slate-400 hover:text-blue-500 size-4',
    tagPopup:   'w-full bg-white shadow-md',
    tagList:    'w-full min-h-8 flex flex-col gap-1 px-1 py-2',
    helpButton: 'p-2 border border-[#E0EBF0] rounded-full print:hidden',
    helpIcon:   'text-slate-400 hover:text-blue-500 size-4 print:hidden flex justify-center items-center',
    helpPopup:  'max-w-[500px] flex flex-col px-4 py-2 bg-white shadow-md',
    // Edit mode (HelpTextEditPopups / SectionEdit) — historical literals.
    helpEditPopup:  'max-w-[500px] flex flex-col bg-white shadow-md',
    helpDeleteIcon: 'text-red-400 hover:text-red-600 self-end size-4 hover:cursor-pointer',
    editHeaderRow:       'flex flex-row font-display font-medium uppercase scroll-mt-36 items-center',
    editHeaderTitleWrap: 'flex-1',
};

// A section-theme token, falling back to the historical literal above. Shared by the view
// header (ViewSectionHeader) and edit mode (section.jsx SectionEdit, HelpTextEditPopups).
export const sectionToken = (sectionTheme, key) => sectionTheme?.[key] ?? HEADER_DEFAULTS[key];

// Title class for a section `level`: the theme's `headerTitleLevels` map when it sets one,
// else the site-wide `theme.heading` lookup (historical).
export const sectionTitleClass = (sectionTheme, fullTheme, level) => {
    const levels = sectionToken(sectionTheme, 'headerTitleLevels');
    return levels && typeof levels === 'object'
        ? `w-full ${levels[level] || levels['default'] || ''}`
        : `w-full ${fullTheme?.heading?.[level] || fullTheme?.heading?.['default']}`;
};

