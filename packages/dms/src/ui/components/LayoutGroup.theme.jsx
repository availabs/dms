import React from 'react'

export const layoutGroupTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
     {
      name: "content",
      wrapper1: 'w-full flex-1 flex flex-row p-2 ', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 min-h-[200px]', // content wrapper
      wrapper3: ''
    },
    {
      name: "header",
      wrapper1: 'w-full flex-1 flex flex-row', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full  flex-col  relative min-h-[200px]', // content wrapper
      wrapper3: ''
    },
    {
      name: "auth",
      wrapper1: 'w-full flex-1 flex flex-row p-2 ', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full  flex-col  shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 place-content-center', // content wrapper
      wrapper3: ''
    },
    {
      // workbench — full-screen tool surface (maps, explorers): no max-width,
      // no card chrome, no band padding. Pair with a p-0 section and a
      // viewport-height element (e.g. the Map component's `screen` height) so
      // the section fills everything beside the sidenav.
      name: "workbench",
      wrapper1: 'w-full',
      wrapper2: 'w-full',
      wrapper3: ''
    },
  ]
}

export const layoutGroupSettings =  (theme) => [
  {
    label: "Layout Group Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
        options: (theme?.layoutGroup?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `layoutGroup.options.activeStyle`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.layoutGroup.styles.push({ ...draft.layoutGroup.styles[0], name: 'new style', })
            //draft.layoutGroup.options.activeStyle = draft.layoutGroup.styles.length
          })
          console.log('add style', e)
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
      {
        label: 'Remove Style',
        type: 'Button',
        children: <div>Remove Style</div>,
        //disabled:
        onClick: (e, setState) => {
          setState(draft => {
            if (draft.layoutGroup.styles.length > 1) {
              draft.layoutGroup.styles.splice(theme.layoutGroup.options.activeStyle, 1)
              draft.layoutGroup.options.activeStyle = 0
            }
          })
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
    ]
  },
  {
    label: "LayoutGroup",
    type: 'inline',
    controls: [
      ...Object.keys(theme?.layoutGroup?.styles?.[theme?.layoutGroup?.options?.activeStyle || 0] || {})
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `layoutGroup.styles[${theme?.layoutGroup?.options?.activeStyle}].${k}`
          }
        })
    ]
  }
]
