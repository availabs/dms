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
      contentWrapper: 'h-full'
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
          type: 'Select',
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
