export const sectionArrayTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      wrapper: 'relative',
      gridOverlay: 'absolute inset-0 pointer-events-none',
      container: 'w-full grid grid-cols-6 ', //gap-1 md:gap-[12px]
      gridSize: 6,
      layouts: {
          centered: 'max-w-[1020px] mx-auto',
          fullwidth: ''
      },
      sectionEditWrapper: 'relative group',
      sectionEditHover: 'absolute inset-0 group-hover:border border-blue-300 border-dashed pointer-events-none z-10',
      sectionViewWrapper: 'relative group',
      sectionPadding: 'p-4',
      gridviewGrid: 'z-0 bg-slate-50 h-full',
      gridviewItem: 'border-x bg-white border-slate-100/75 border-dashed h-full p-[6px]',
      defaultOffset: 16,
      addSectionButton: 'cursor-pointer py-0.5 text-sm text-blue-200 hover:text-blue-400 truncate w-full hover:bg-blue-50/75 -ml-4 hidden group-hover:flex absolute -top-5',
      spacer: 'flex-1',
      addSectionIconWrapper: 'flex items-center',
      addSectionIcon: 'size-6',
      sizes: {
          "1/3": { className: 'col-span-12 md:col-span-2', iconSize: 33 },
          "1/2": { className: 'col-span-12 md:col-span-3', iconSize: 50 },
          "2/3": { className: 'col-span-12 md:col-span-4', iconSize: 66 },
          "1":   { className: 'col-span-12 md:col-span-6', iconSize: 100 },
      },
      rowspans: {
          "1" : { className: '' },
          "2" : { className: 'md:row-span-2'},
          "3" : { className: 'md:row-span-3'},
          "4" : { className: 'md:row-span-4'},
          "5" : { className: 'md:row-span-5'},
          "6" : { className: 'md:row-span-6'},
          "7" : { className: 'md:row-span-7'},
          "8" : { className: 'md:row-span-8'},
      },
      border: {
          none: '',
          full: 'border border-[#E0EBF0] rounded-lg',
          openLeft: 'border border-[#E0EBF0] border-l-transparent rounded-r-lg',
          openRight: 'border border-[#E0EBF0] border-r-transparent rounded-l-lg',
          openTop: 'border border-[#E0EBF0] border-t-transparent rounded-b-lg',
          openBottom: 'border border-[#E0EBF0] border-b-transparent rounded-t-lg',
          borderX: 'border border-[#E0EBF0] border-y-transparent'
      }
    }
  ]
}

export default sectionArrayTheme

const themeClasses = {
  "layout": [
    "wrapper",
    "container",
    "gridSize",
    "gridOverlay",
  ],
  "section": [
    "sectionEditWrapper",
    "sectionEditHover",
    "sectionViewWrapper",
    "sectionPadding",
  ],
  "grid": [
    "gridviewGrid",
    "gridviewItem",
    "defaultOffset",
  ],
  "addSection": [
    "addSectionButton",
    "spacer",
    "addSectionIconWrapper",
    "addSectionIcon",
  ]
}

export const sectionArraySettings = (theme) => {
  const activeStyle = theme?.pages?.sectionArray?.options?.activeStyle || 0
  return [
    {
      label: "Section Array Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.pages?.sectionArray?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.sectionArray.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.pages.sectionArray.styles.push({ ...draft.pages.sectionArray.styles[0], name: 'new style' })
            })
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: <div>Remove Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.pages.sectionArray.styles.length > 1) {
                draft.pages.sectionArray.styles.splice(activeStyle, 1)
                draft.pages.sectionArray.options.activeStyle = 0
              }
            })
          }
        },
      ]
    },
    {
      label: "Section Array Layout",
      type: 'inline',
      controls: themeClasses.layout
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.sectionArray.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Section Wrappers",
      type: 'inline',
      controls: themeClasses.section
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.sectionArray.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Grid View",
      type: 'inline',
      controls: themeClasses.grid
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.sectionArray.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Add Section Button",
      type: 'inline',
      controls: themeClasses.addSection
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.sectionArray.styles[${activeStyle}].${k}`
          }
        })
    }
  ]
}
