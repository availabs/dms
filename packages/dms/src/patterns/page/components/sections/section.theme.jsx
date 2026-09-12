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
      menuPosition: 'absolute top-[5px] right-[5px] items-center flex gap-0.5 z-40',
      editIcon: 'hover:text-blue-500 size-6',
      contentWrapper: 'h-full',

      // Row rendered below the title/menu header when a theme registers
      // section-header extensions (see sectionHeaderExtensions.js) for this
      // section's component type. Empty by default so sites with no
      // registered extensions render byte-identical to before this key
      // existed — sites that use the feature supply background/padding here.
      headerExtensionsRow: '',

      // ── Section header band ──────────────────────────────────────────
      // The title band itself (section_components.jsx's ViewSectionHeader).
      // Every value here is the literal that component hardcoded before these
      // keys existed, so leaving them alone renders byte-identically — locked
      // by tests/viewSectionHeaderLegacy.test.js. They are listed explicitly
      // rather than left undefined so the admin theme editor can surface them
      // and a reader can see what the band is made of.
      //
      // A brand that wants a card-style header (title + meta on one bordered
      // row, the graph-card shape) overrides these on a NAMED style and points
      // individual sections at it via `value.activeStyle` — see section.jsx's
      // getComponentTheme call. Site-wide is usually wrong: a docs page and a
      // report card want very different bands.
      headerRow:       'flex w-full min-h-[50px] items-center pb-2',
      headerInner:     'flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center',
      headerTitleWrap: 'flex-1',
      headerActions:   'flex item-center h-full pointer-events-auto',
      // APPENDED to the historical `w-full ${theme.heading[level]}` string, not
      // a replacement — so a site keeps whatever its heading map already did.
      headerTitle:     '',
      // The right-hand meta line, rendered from the section's `description`
      // attribute. Unset ⇒ never rendered, so a description typed into the
      // Settings drawer stays invisible until a theme opts in.
      headerKicker:    '',
      // true ⇒ header extensions render INSIDE the band, sharing the row with
      // the title, instead of on their own row below it (and the kicker yields
      // the slot to them). false keeps the historical two-row layout.
      headerExtensionsInline: false,
      headerExtensionsInlineRow: 'shrink-0 flex items-center gap-1.5',

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
    "headerExtensionsInlineRow",
  ],
  "menu": [
    "menuPosition",
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
