import React from 'react'
import { Button } from '@headlessui/react'
import { ThemeContext, getComponentTheme } from '../useTheme'

export const buttonTheme = {
  options: {
    activeStyle:0
  },
  styles: [
    {
      name: 'default Buttons',
      button: `inline-flex items-center gap-2  bg-gray-700 py-1.5  text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-gray-600 data-[open]:bg-gray-700 data-[focus]:outline-1 data-[focus]:outline-white
        rounded-lg
        px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `,
    },
    {
      name:'plain',
      button: `cursor-pointer relative isolate inline-flex items-center justify-center gap-x-2 rounded-lg border text-base/6 font-semibold  sm:text-sm/6 focus:outline-none data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500 data-[disabled]:opacity-50 [&>[data-slot=icon]]:-mx-0.5 [&>[data-slot=icon]]:my-0.5 [&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 [&>[data-slot=icon]]:text-[--btn-icon] [&>[data-slot=icon]]:sm:my-1 [&>[data-slot=icon]]:sm:size-4 forced-colors:[--btn-icon:ButtonText] forced-colors:data-[hover]:[--btn-icon:ButtonText] border-transparent text-zinc-950 data-[active]:bg-zinc-950/5 data-[hover]:bg-zinc-950/5 dark:text-white dark:data-[active]:bg-white/10 dark:data-[hover]:bg-white/10 [--btn-icon:theme(colors.zinc.500)] data-[active]:[--btn-icon:theme(colors.zinc.700)] data-[hover]:[--btn-icon:theme(colors.zinc.700)] dark:[--btn-icon:theme(colors.zinc.500)] dark:data-[active]:[--btn-icon:theme(colors.zinc.400)] dark:data-[hover]:[--btn-icon:theme(colors.zinc.400)] cursor-default
      rounded-lg
      px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `
    },
    {
      name: 'active',
      button: `cursor-pointer px-4 inline-flex  justify-center cursor-pointer text-sm font-semibold  bg-blue-600 text-white hover:bg-blue-500 shadow-lg border border-b-4 border-blue-800 hover:border-blue-700 active:border-b-2 active:mb-[2px] active:shadow-none
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
        type: 'Select',
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

// buttonType = type. in some configs, type is reserved for component type, but here to pick theme, they're the same
export default function ButtonComp ({ children, disabled, onClick=()=>{}, type='default', buttonType, padding, rounded, className, activeStyle,...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(themeFromContext,'button', activeStyle)//{...themeFromContext, button: {...buttonTheme, ...(themeFromContext.button || {})}};

  return (
    <Button
      disabled={disabled}
      className={className || theme?.button}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}
