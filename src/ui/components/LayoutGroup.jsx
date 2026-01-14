import React from 'react'
import { ThemeContext, getComponentTheme } from "../useTheme";

export default function LayoutGroup ({children, outerChildren, activeStyle}) {
  const { theme } = React.useContext(ThemeContext);
 // console.log('LayoutGroup', activeStyle)
  const layoutGrouptheme = getComponentTheme(theme, 'layoutGroup', activeStyle);

  return (
    <div className={`${layoutGrouptheme?.wrapper1}`}>
      {outerChildren}
      <div className={layoutGrouptheme?.wrapper2}>
        <div className={layoutGrouptheme?.wrapper3}>
          {children}
        </div>
      </div>
    </div>
  )
}

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
    }
  ]
}

export const layoutGroupSettings =  (theme) => [
  {
    label: "Layout Group Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'Select',
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
      ...Object.keys(theme?.layoutGroup?.styles?.[theme?.layoutGroup?.options?.activeStyle || 0] )
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
