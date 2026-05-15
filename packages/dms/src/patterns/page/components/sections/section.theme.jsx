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
      topBarButtonsEdit: 'flex gap-1 z-10',
      topBarButtonsView: 'z-10',
      menuPosition: 'absolute top-[5px] right-[5px] items-center flex gap-0.5',
      editIcon: 'hover:text-blue-500 size-6',
      contentWrapper: 'h-full',

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
