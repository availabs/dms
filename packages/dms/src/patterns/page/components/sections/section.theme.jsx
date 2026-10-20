export const sectionTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      wrapper: '',
      wrapperHidden: 'hidden',
      topBar: 'flex',
      topBarSpacer: 'flex-1',
      // z-40 on the BUTTON ROWS, not just on menuPosition below. These are flex items of
      // `topBar` ('flex'), and z-index applies to a flex item even though it is
      // position:static — so each one creates a STACKING CONTEXT. At the old z-10 the
      // whole menu subtree was trapped at layer 10 no matter what z-index the menu
      // itself carried, and any section content that raised itself (a sticky toolbar, a
      // pinned header) painted over the Settings button, leaving the section uneditable.
      // Raising the child alone does nothing; the context has to move.
      // Below sectionGroup's modalOverlay (z-50) so a modal still wins.
      topBarButtonsEdit: 'flex gap-1 z-40',
      topBarButtonsView: 'z-40',
      menuPosition: 'absolute top-2 right-2 items-center flex gap-1 z-40',
      // icons in the section menu's action rows (sectionMenu.jsx) — 16px, as on page-edit.html
      menuActionIcon: 'size-4',
      // action-row buttons (sectionMenu.jsx ActionBtn): a UI.Button named style — 28px row icons, "copied" =
      // 'iconRowGo' (2026-10-16; was menuActionBtn / menuActionBtnDone / menuActionSave class strings).
      // '' (legacy freeze) → the old Pill chips.
      menuActionStyle: 'iconRow',
      editIcon: 'hover:text-blue-500 size-6',
      contentWrapper: 'h-full',

      // Row rendered below the title/menu header when a theme registers
      // section-header extensions (see sectionHeaderExtensions.js) for this
      // section's component type. Empty by default so sites with no
      // registered extensions render byte-identical to before this key
      // existed — sites that use the feature supply background/padding here.
      headerExtensionsRow: '',

      // ── Section header band ──────────────────────────────────────────
      // The title band itself (section_components.jsx's ViewSectionHeader) — tessera v6,
      // 2026-10-08, from src/themes/tessera/design_system_v6/pages/page-view.html. Every
      // project theme keeps the pre-v6 band: those values are frozen in
      // src/themes/_legacy/pages.js `section` (and are the HEADER_DEFAULTS fallback a theme
      // with no `pages.section` style gets — locked by tests/viewSectionHeaderLegacy.test.js).
      //
      // A brand that wants a card-style header (title + meta on one bordered
      // row, the graph-card shape) overrides these on a NAMED style and points
      // individual sections at it via `value.activeStyle` — see section.jsx's
      // getComponentTheme call. Site-wide is usually wrong: a docs page and a
      // report card want very different bands.
      headerRow:       'flex w-full min-h-[40px] items-center gap-3 pb-2',
      // title · [help][tags] · … kicker. The DOM order is title, kicker, actions; `order-*`
      // keeps the help/tags buttons beside the title and pushes the kicker to the right edge.
      headerInner:     'flex-1 min-w-0 flex flex-row flex-wrap items-center gap-x-2 gap-y-1 scroll-mt-36',
      headerTitleWrap: 'min-w-0',
      headerActions:   'order-1 flex items-center gap-0.5 pointer-events-auto',
      // APPENDED to the title's `w-full ${level class}` string, not a replacement.
      headerTitle:     '',
      // Title class per section `level`. When set it REPLACES the site-wide `theme.heading[level]`
      // lookup for section titles ('' → use theme.heading, the pre-v6 behaviour).
      headerTitleLevels: {
        '1': 't-displayMD text-[var(--t-ink)]',
        '2': 't-displaySM text-[var(--t-ink)]',
        '3': 't-prose font-semibold text-[var(--t-ink)]',
        '4': 't-proseSM font-semibold text-[var(--t-ink)]',
        default: 't-displaySM text-[var(--t-ink)]',
      },
      // The right-hand meta line, rendered from the section's `description`
      // attribute. Unset ⇒ never rendered ('' in the legacy freeze).
      headerKicker:    'order-2 ml-auto shrink-0 t-metaXS text-[var(--t-pencil)]',
      // true ⇒ header extensions render INSIDE the band, sharing the row with
      // the title, instead of on their own row below it (and the kicker yields
      // the slot to them). false keeps the historical two-row layout.
      headerExtensionsInline: false,
      headerExtensionsInlineRow: 'shrink-0 flex items-center gap-1.5',
      // Tags + help-text triggers beside the title, and their popups (were hardcoded).
      tagButton:   'size-7 inline-flex items-center justify-center rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer print:hidden',
      tagIcon:     'size-4',
      tagPopup:    'w-full min-w-[160px] bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)]',
      tagList:     'w-full flex flex-wrap gap-1 p-2',
      helpButton:  'size-7 inline-flex items-center justify-center rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)] cursor-pointer print:hidden',
      helpIcon:    'size-4',
      helpPopup:   'max-w-[420px] flex flex-col px-4 py-3 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)] t-proseSM text-[var(--t-graphite)]',

      // ── Edit mode (SectionEdit + the menu trigger row) — tessera v6, 2026-10-08 (page-edit.html) ──
      // The header row of the section being edited (was hardcoded in section.jsx).
      editHeaderRow:       'flex flex-row items-center gap-2 pb-2 scroll-mt-36',
      editHeaderTitleWrap: 'flex-1 min-w-0',
      // "Hidden from View" marker beside the menu trigger ('' → UI.Pill orange, pre-v6).
      hiddenPill:     'inline-flex items-center gap-1 t-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded-full px-2 py-0.5',
      hiddenPillIcon: 'size-3',
      // Help-text editor popup (HelpTextEditPopups) + its delete icon.
      helpEditPopup:  'w-[420px] max-w-[90vw] flex flex-col gap-2 p-3 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)]',
      helpDeleteIcon: 'self-end size-4 text-[var(--t-pencil)] hover:text-[var(--t-brick)] cursor-pointer',

      // Min-height applied only in page edit mode so a section with no
      // data (empty filter result, empty draft, etc.) still reserves
      // enough vertical room for its settings handle to be reachable.
      // View mode is unaffected — the BC contract from the section-height
      // task is about end-user view rendering.
      editMinHeight: '40px',

      // Named height presets selectable per-section via `value.height`. The
      // section wrapper resolves the chosen key against this map and applies
      // the resulting CSS value as inline style. Sites can override / extend
      // by shipping `pages.section.styles[i].heights` in their own theme.
      //
      //   auto — default; section is content-sized. No inline style applied
      //          to the wrapper, so existing sections render byte-identical
      //          to pre-feature behaviour. (Required for backwards compat —
      //          see planning/tasks/current/section-height-setting.md.)
      //   fill — sentinel meaning "expand to fill the parent flex/grid track."
      //          Section wrapper switches to flex sizing (`flex: 1 1 auto`),
      //          requires the wrapping sectionGroup to be a flex/grid context
      //          (e.g. the home-page `header` sectionGroup).
      //   hero/tall/medium/small — literal CSS values. Pass-through verbatim
      //          so a theme override can encode `clamp(...)` / `calc(...)` /
      //          `vh` etc.
      heights: {
        auto: 'auto',
        fill: 'fill',
        hero: 'calc(100vh - 80px)',
        tall: '640px',
        medium: '400px',
        small: '240px',
      },
    }
  ]
}

export default sectionTheme

const themeClasses = {
  "layout": [
    "wrapper",
    "wrapperHidden",
    "contentWrapper",
  ],
  "topBar": [
    "topBar",
    "topBarSpacer",
    "topBarButtonsEdit",
    "topBarButtonsView",
    "headerExtensionsRow",
  ],
  "header": [
    "headerRow",
    "headerInner",
    "headerTitleWrap",
    "headerTitle",
    "headerKicker",
    "headerActions",
    "tagButton",
    "tagIcon",
    "tagPopup",
    "tagList",
    "helpButton",
    "helpIcon",
    "helpPopup",
    "editHeaderRow",
    "editHeaderTitleWrap",
    "hiddenPill",
    "hiddenPillIcon",
    "helpEditPopup",
    "helpDeleteIcon",
    "headerExtensionsInlineRow",
  ],
  "menu": [
    "menuPosition",
    "menuActionIcon",
    "menuActionStyle",
    "editIcon",
  ]
}

export const sectionSettings = (theme) => {
  const activeStyle = theme?.pages?.section?.options?.activeStyle || 0
  return [
    {
      label: "Section Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
          options: (theme?.pages?.section?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.section.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.pages.section.styles.push({ ...draft.pages.section.styles[0], name: 'new style' })
            })
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: <div>Remove Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.pages.section.styles.length > 1) {
                draft.pages.section.styles.splice(activeStyle, 1)
                draft.pages.section.options.activeStyle = 0
              }
            })
          }
        },
      ]
    },
    {
      label: "Section Layout",
      type: 'inline',
      controls: themeClasses.layout
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.section.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Section Top Bar",
      type: 'inline',
      controls: themeClasses.topBar
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.section.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Section Header",
      type: 'inline',
      controls: themeClasses.header
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.section.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Section Menu",
      type: 'inline',
      controls: themeClasses.menu
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.section.styles[${activeStyle}].${k}`
          }
        })
    }
  ]
}
