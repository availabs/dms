// Search button + palette (components/search/index.jsx) — tessera v6, 2026-10-08, from
// design_system_v6/pages/page-search.html; no accent colour. Pre-v6 values (MNY-flavoured) are
// frozen in src/themes/_legacy/pages.js `searchButton` / `searchPallet`.
// SearchButton Theme
export const searchButtonTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // The trigger is a UI.Button named style (2026-10-16, raw-HTML pass): 'searchTrigger' in Button.theme.jsx — icon
    // first (order-first), then "Search". Its layout (margins) sits on buttonWrap. A project theme's own `button`
    // classes are lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles; buttonWrap emptied).
    "buttonStyle": "searchTrigger",
    "buttonWrap": "flex flex-col mx-3 mt-4",   // flex-col: the trigger fills the nav width, as the old raw button did
    // Button text
    "buttonText": "flex-1 text-left t-proseSM text-[var(--t-pencil)]",
    // Icon wrapper
    "iconWrapper": "order-first flex items-center text-[var(--t-pencil)]",
    // Icon
    "icon": "Search",
    "iconClass": "size-3.5",
    "iconSize": 14
  }]
}

// SearchPallet Theme
export const searchPalletTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // (backdrop / dialogContainer / dialogPanel / input: unused since the palette moved onto
    // UI.Modal + UI.Input — kept for themes that still set them.)
    "backdrop": "fixed inset-0 bg-[var(--t-scrim)] transition-opacity",
    "dialogContainer": "fixed inset-0 z-50 w-screen overflow-y-auto p-4 sm:p-6 md:p-20 flex items-start justify-center",
    "dialogPanel": "relative w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden rounded-xl bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)]",

    // Search input area — the icon sits left of the input (row-reverse)
    "inputWrapper": "w-full flex flex-row-reverse items-center gap-2",
    "input": "flex-1 bg-transparent t-proseLG text-[var(--t-ink)] outline-none placeholder:text-[var(--t-pencil)]",
    "searchIconWrapper": "shrink-0 text-[var(--t-pencil)]",
    "searchIcon": "Search",
    "searchIconClass": "size-5",

    // Results area
    "resultsWrapper": "mt-2 text-left flex flex-col divide-y divide-[var(--t-rule)] max-h-[60vh] overflow-x-hidden overflow-y-auto scrollbar-sm",
    "resultItemWrapper": "flex flex-col gap-0.5 w-full select-none",
    "resultItemOuter": "select-none py-1",

    // Page result
    "pageResultWrapper": "group w-full flex items-center gap-2 px-3 py-2 rounded-md t-proseSM font-medium text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer",
    "pageIcon": "File",
    "pageIconWidth": 16,
    "pageIconHeight": 16,
    "pageTitle": "flex-1 min-w-0 truncate",
    "pageArrowIcon": "ArrowRight",
    "pageArrowClass": "size-3.5 text-[var(--t-pencil)] opacity-0 group-hover:opacity-100",

    // Sections
    "sectionsWrapper": "flex flex-col",
    "sectionItemWrapper": "w-full cursor-pointer group pl-9 pr-3 py-2 rounded-md hover:bg-[var(--t-well)]",
    "sectionTitleWrapper": "w-full flex items-center gap-2 t-proseSM text-[var(--t-graphite)]",
    "sectionIcon": "Text",
    "sectionIconWidth": 16,
    "sectionIconHeight": 16,
    "sectionTitle": "flex-1 min-w-0 truncate",
    "sectionArrowClass": "size-3.5 text-[var(--t-pencil)] opacity-0 group-hover:opacity-100",

    // Tags
    "tagsWrapper": "flex flex-wrap gap-1 mt-1 pl-6",
    "tag": "t-metaXS rounded px-1.5 py-0.5",
    "tagMatch": "text-[var(--t-ink)] bg-[var(--t-well)] border border-[var(--t-rule-strong)]",
    "tagNoMatch": "text-[var(--t-graphite)] border border-[var(--t-rule)]",

    // Suggestions (the section tags matching the query) — shown when showSuggestions is set
    "showSuggestions": true,
    "suggestionsWrapper": "flex flex-wrap items-center gap-1.5 py-2 text-left",
    "suggestionsLabel": "t-metaXS text-[var(--t-pencil)]",
    "suggestionItem": "inline-flex items-center gap-1 rounded-full border border-[var(--t-rule)] px-2 py-0.5 cursor-pointer hover:border-[var(--t-ink)]",
    "suggestionTagIcon": "",
    "suggestionTagIconName": "Search",          // registry icon ('' → the <i className=suggestionTagIcon>)
    "suggestionTagIconClass": "size-3 text-[var(--t-pencil)]",
    "suggestionTagText": "t-metaXS text-[var(--t-graphite)]",
    "suggestionTagTextFocus": "t-metaXS text-[var(--t-ink)]",

    // Loading state
    "loadingWrapper": "py-10 flex flex-col items-center gap-2",
    "loadingIcon": "",
    "loadingIconName": "Spinner",
    "loadingIconClass": "size-5 text-[var(--t-pencil)] animate-spin",
    "loadingText": "t-proseSM text-[var(--t-graphite)]",

    // No results state
    "noResultsWrapper": "py-10 text-center",
    "noResultsIcon": "",
    "noResultsIconName": "Search",
    "noResultsIconClass": "size-6 mx-auto text-[var(--t-pencil)]",
    "noResultsTitle": "mt-2 t-proseSM font-medium text-[var(--t-ink)]",
    "noResultsText": "t-proseSM text-[var(--t-graphite)]"
  }]
}

// Settings for admin UI
export const searchButtonSettings = (theme) => {
  const activeStyle = theme?.pages?.searchButton?.options?.activeStyle || 0
  return [
    {
      label: "Search Button Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
          options: (theme?.pages?.searchButton?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.searchButton.options.activeStyle`,
        },
        {
          label: 'button style (a Button named style)',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].buttonStyle`
        },
        {
          label: 'buttonWrap',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].buttonWrap`
        },
        {
          label: 'buttonText',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].buttonText`
        },
        {
          label: 'iconWrapper',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].iconWrapper`
        },
        {
          label: 'icon',
          type: 'Input',
          path: `pages.searchButton.styles[${activeStyle}].icon`
        },
      ]
    }
  ]
}

export const searchPalletSettings = (theme) => {
  const activeStyle = theme?.pages?.searchPallet?.options?.activeStyle || 0
  return [
    {
      label: "Search Pallet Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
          options: (theme?.pages?.searchPallet?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.searchPallet.options.activeStyle`,
        },
      ]
    },
    {
      label: "Dialog",
      type: 'inline',
      controls: [
        {
          label: 'backdrop',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].backdrop`
        },
        {
          label: 'dialogContainer',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].dialogContainer`
        },
        {
          label: 'dialogPanel',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].dialogPanel`
        },
      ]
    },
    {
      label: "Input",
      type: 'inline',
      controls: [
        {
          label: 'inputWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].inputWrapper`
        },
        {
          label: 'input',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].input`
        },
      ]
    },
    {
      label: "Results",
      type: 'inline',
      controls: [
        {
          label: 'resultsWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].resultsWrapper`
        },
        {
          label: 'resultItemWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].resultItemWrapper`
        },
        {
          label: 'pageTitle',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].pageTitle`
        },
        {
          label: 'sectionTitle',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].sectionTitle`
        },
      ]
    }
  ]
}
