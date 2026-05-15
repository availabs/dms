import React from 'react'

export const buttonTheme = {
  options: {
    activeStyle:0
  },
  styles: [
    {
      name: 'default Buttons',
      button: `cursor-pointer inline-flex items-center gap-2  bg-gray-700 py-1.5  text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none hover:bg-gray-600 transition-colors focus-visible:outline-1 focus-visible:outline-white
        rounded-lg
        px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `,
    },
    {
      name:'plain',
      button: `cursor-pointer relative isolate inline-flex items-center justify-center gap-x-2 rounded-lg border text-base/6 font-semibold  sm:text-sm/6 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 [&>[data-slot=icon]]:-mx-0.5 [&>[data-slot=icon]]:my-0.5 [&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 [&>[data-slot=icon]]:text-[--btn-icon] [&>[data-slot=icon]]:sm:my-1 [&>[data-slot=icon]]:sm:size-4 forced-colors:[--btn-icon:ButtonText] forced-colors:hover:[--btn-icon:ButtonText] border-transparent text-zinc-950 active:bg-zinc-950/5 hover:bg-zinc-950/5 dark:text-white dark:active:bg-white/10 dark:hover:bg-white/10 [--btn-icon:theme(colors.zinc.500)] active:[--btn-icon:theme(colors.zinc.700)] hover:[--btn-icon:theme(colors.zinc.700)] dark:[--btn-icon:theme(colors.zinc.500)] dark:active:[--btn-icon:theme(colors.zinc.400)] dark:hover:[--btn-icon:theme(colors.zinc.400)] cursor-default
      rounded-lg
      px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `
    },
    {
      name: 'active',
      // 3D press effect via box-shadow (not asymmetric border) so the button's
      // content box matches the default style — both buttons share identical
      // padding and borders, keeping text aligned across styles.
      button: `cursor-pointer inline-flex items-center justify-center gap-2 text-sm/6 font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-[0_3px_0_#1e40af] hover:shadow-[0_3px_0_#1d4ed8] active:shadow-none active:translate-y-[3px] focus:outline-none focus-visible:outline-1 focus-visible:outline-white
      rounded-lg
      px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `,
    }



  ]
}

export const buttonSettings = (theme) => [
  {
    label: "Layout Group Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
        options: (theme?.button?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `button.options.activeStyle`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.buttons.styles.push({ ...draft.buttons.styles[0], name: 'new style', })

          })
        }
      },
      {
        label: 'Remove Style',
        type: 'Button',
        children: <div>Remove Style</div>,
        //disabled:
        onClick: (e, setState) => {
          setState(draft => {
            if (draft.button.styles.length > 1) {
              draft.button.styles.splice(theme.button.options.activeStyle, 1)
              draft.button.options.activeStyle = 0
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
      ...Object.keys(theme?.button?.styles?.[theme?.button?.options?.activeStyle || 0] )
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `button.styles[${theme?.layoutGroup?.options?.activeStyle}].${k}`
          }
        })
    ]
  }
]

export const docs = [
  {type: 'default', children: 'Button', doc_name: 'Default Button'},
  {type: 'plain', children: 'Button', doc_name: 'Plain Button'},
  {type: 'active', children: 'Button', doc_name: 'Active Button'},
  {type: 'inactive', children: 'Button', doc_name: 'Inactive Button'},
]
