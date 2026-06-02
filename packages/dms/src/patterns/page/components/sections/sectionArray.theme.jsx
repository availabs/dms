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
      sectionEditHover: 'absolute inset-0 border border-transparent group-hover:border-blue-900 border border-2 pointer-events-none z-10 rounded-md',
      sectionEditing: 'absolute inset-0 border border-orange-300 border-dashed pointer-events-none z-10 rounded-md',
      sectionHighlight: 'absolute inset-0 border border-orange-300 border-dashed pointer-events-none z-10 rounded-md', // on scroll url hash
      sectionViewWrapper: 'relative group',
      sectionPadding: 'p-4',
      defaultPaddingStep: '4',      // per-side gutter default (matches the old p-4 spacing)
      gridviewGrid: 'z-0 bg-slate-50 h-full',
      gridviewItem: 'border-x bg-white border-slate-100/75 border-dashed h-full p-[6px]',
      defaultOffset: 16,
      addSectionButton: 'cursor-pointer py-0.5 text-sm text-blue-200 hover:text-blue-400 truncate w-full -ml-4 my-2 hidden group-hover:flex absolute -top-5 z-11',
      spacer: 'flex-1',
      addSectionIconWrapper: 'flex items-center group/icon',
      addSectionIcon: 'size-6 p-1.5 text-white bg-blue-900 rounded-full group-hover/icon:hidden',
      addSectionTextWrapper: 'hidden group-hover/icon:flex items-center',
      addSectionText: 'px-1.5 py-1 text-white text-sm font-semibold bg-blue-900 rounded-full',
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
      // Legacy named border presets (radius baked in) — kept so existing sections
      // (`border: 'full'`, etc.) render unchanged. New edits use `borderSides` +
      // `radiusCorners` (per-side / per-corner) below.
      border: {
          none: '',
          full: 'border border-[#E0EBF0] rounded-lg',
          openLeft: 'border border-[#E0EBF0] border-l-transparent rounded-r-lg',
          openRight: 'border border-[#E0EBF0] border-r-transparent rounded-l-lg',
          openTop: 'border border-[#E0EBF0] border-t-transparent rounded-b-lg',
          openBottom: 'border border-[#E0EBF0] border-b-transparent rounded-t-lg',
          borderX: 'border border-[#E0EBF0] border-y-transparent'
      },
      // ── Compound-card per-edge controls (literal classes so Tailwind generates
      // them; the picker offers these, the render composes the chosen ones). ──
      // Per-side border toggles against the one brand line.
      borderSides: {
          top:    'border-t border-[#E0EBF0]',
          right:  'border-r border-[#E0EBF0]',
          bottom: 'border-b border-[#E0EBF0]',
          left:   'border-l border-[#E0EBF0]',
      },
      // Per-corner radius toggles (one brand corner size).
      radiusCorners: {
          tl: 'rounded-tl-lg', tr: 'rounded-tr-lg', bl: 'rounded-bl-lg', br: 'rounded-br-lg',
      },
      // Inner-card background options (the per-side border carries no bg of its own).
      backgrounds: {
          none: '', white: 'bg-white', tint: 'bg-slate-50',
      },
      // Per-side padding steps the picker offers.
      // Curated gutter steps (fewer = wider, more usable buttons).
      paddings: {
          top:    { '0':'pt-0','2':'pt-2','4':'pt-4','6':'pt-6','8':'pt-8' },
          right:  { '0':'pr-0','2':'pr-2','4':'pr-4','6':'pr-6','8':'pr-8' },
          bottom: { '0':'pb-0','2':'pb-2','4':'pb-4','6':'pb-6','8':'pb-8' },
          left:   { '0':'pl-0','2':'pl-2','4':'pl-4','6':'pl-6','8':'pl-8' },
      },
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
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
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
