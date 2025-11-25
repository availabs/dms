
export const layoutSettings = (theme) => {
  const activeStyle=theme?.layout?.options?.activeStyle
  const topNavOptions = [
    {
      label: 'TopNav Menu',
      type: 'Select',
      options: [
        { label: 'none', value: 'none' },
        { label: 'main', value: 'main' },
        { label: 'secondary', value: 'secondary' }
      ],
      path: `layout.options.topNav.nav`,
    },
    {
      label: 'Active Style',
      type: 'Select',
      options: [
        { label: 'default', value: "" },
        ...(theme?.topNav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
      ],
      path: `layout.options.topNav.activeStyle`,
    },
    {
      label: "Top Nav - Right Menu",
      type: "Listbox",
      options: [
        {
          label: 'Annotation Card',
          value: 'Annotation'
        },
        {
          label: 'HandWritten Card',
          value: 'Handwritten'
        },
      ],
      onChange:(e, setState) => {
        console.log('lisbox on Change', e)
      }
    },
    {
      Label: "",
      type: "List",
      valueMap: (d) => d.type,
      path: `layout.options.topNav.rightMenu`

    }
  ]

  const sideNavOptions = [
    {
      label: 'Active Style',
      type: 'Select',
      options: [
        { label: 'default', value: "" },
        ...(theme?.sidenav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
      ],
      path: `layout.options.sideNav.activeStyle`,
    },
    {
      label: 'SideNav Menu',
      type: 'Select',
      options: [
        { label: 'none', value: 'none' },
        { label: 'main', value: 'main' },
        { label: 'secondary', value: 'secondary' }
      ],
      path: `layout.options.sideNav.nav`,
    },
    {
      label: "Side Nav - Top Menu",
      type: "Listbox",
      options: [
        {
          label: 'Annotation Card',
          value: 'Annotation'
        },
        {
          label: 'HandWritten Card',
          value: 'Handwritten'
        },
      ],
      onChange:(e, setState) => {
        console.log('lisbox on Change', e)
      }
    },
    {
      Label: "",
      type: "List",
      valueMap: (d) => d.type,
      path: `layout.options.topNav.rightMenu`

    }
  ]


  return [
    {
      label: "TopNav Options",
      type: "inline",
      controls: [
        {
          label: 'TopNav',
          type: 'Select',
          options: [{ label: 'hide', value: 'none' },{ label: 'show', value: 'compact' }],
          path: `layout.options.topNav.size`,
        },
        ...(theme.layout.options.topNav.size !== 'none' ? topNavOptions : []),
      ]
    },
    {
      label: "SideNav Options",
      type: "inline",
      controls:[
        {
          label: 'Side Nav',
          type: 'Select',
          options: [{ label: 'hide', value: 'none' },{ label: 'show', value: 'compact' }],
          path: `layout.options.sideNav.size`,
        },
        ...(theme.layout.options.sideNav.size !== 'none' ? sideNavOptions : []),
      ]
    },
    {
      label: "Layout Styles",
      type: "inline",
      controls:[
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.layout?.styles || [{}])
            .map((k,i) => ({ label: k?.name || i, value: i })),
          path: `layout.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.layout.styles.push({ ...draft.layout.styles[0], name: 'new style', })
              //draft.layout.options.activeStyle = draft.layout.styles.length
            })
            console.log('add style', e)
          }
            //path: `layout.styles[${activeStyle}].outerWrapper`,
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: <div>Remove Style</div>,
          //disabled:
          onClick: (e, setState) => {
            setState(draft => {
                 if (draft.layout.styles.length > 1) {
                   draft.layout.styles.splice(theme.layout.options.activeStyle, 1)
                   draft.layout.options.activeStyle = 0
                 }
              })
            }
            //path: `layout.styles[${activeStyle}].outerWrapper`,
        },
      ]
    },
    {
      label: `Layout ${activeStyle}`,
      type: 'inline',
      controls: [

        {
          label: 'Name',
          type: 'Input',
          path: `layout.styles[${activeStyle}].name`,
        },
        {
          label: 'OuterWrapper',
          type: 'Textarea',
          path: `layout.styles[${activeStyle}].outerWrapper`,
        },
        {
          label: 'Wrapper',
          type: 'Textarea',
          path: `layout.styles[${activeStyle}].wrapper`,
        },
        {
          label: 'Wrapper2',
          type: 'Textarea',
          path: `layout.styles[${activeStyle}].wrapper2`,
        },
        {
          label: 'Wrapper3',
          type: 'Textarea',
          path: `layout.styles[${activeStyle}].wrapper3`,
        },
        {
          label: 'ChildWrapper',
          type: 'Textarea',
          path: `layout.styles[${activeStyle}].childWrapper`,
        }
      ]
    }
  ];
}

export default  {
  "options": {
    "activeStyle": 0,
    "sideNav": {
        "size": "compact",
        "nav": "main",
        "activeStyle": null,
        "topMenu": [],
        "bottomMenu": []
    },
    "topNav": {
      "size": "none",
      "nav": "none",
      "activeStyle": null,
      "leftMenu": [],
      "rightMenu": []
    }
  },
  "styles": [{
    "outerWrapper": 'bg-slate-100',
    "wrapper": `
      relative isolate flex min-h-svh w-full max-lg:flex-col
      bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950 overflow-hidden
    `,
    "wrapper2": 'flex-1 flex items-start flex-col items-stretch max-w-full min-h-screen',
    "wrapper3": 'flex flex-1',
    "childWrapper": 'flex-1 h-full',

  }]
}

// const oldTheme = {
//     outerWrapper: 'bg-slate-100',
//     wrapper: 'relative isolate flex min-h-svh w-full max-lg:flex-col bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950 overflow-hidden',
//     wrapper2: 'flex-1 flex items-start flex-col items-stretch max-w-full',
//     wrapper3: 'flex flex-1',

//     // wrapper2: 'w-full h-full flex-1 flex flex-row lg:px-3', // inside page header, wraps sidebar
//     // wrapper3: 'grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10 relative ' ,

//     childWrapper: 'flex-1 h-full',
//     topnavContainer1:`h-[50px] -mb-1`,
//     topnavContainer2:`fixed w-full z-20 `,
//     sidenavContainer1: 'border-r -mr-3',
//     sidenavContainer2: 'fixed inset-y-0 left-0 w-64 max-lg:hidden',
//     navTitle: `flex-1 text-[24px] font-['Oswald'] font-[500] leading-[24px] text-[#2D3E4C] py-3 px-4 uppercase`
// }
