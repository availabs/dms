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
      // Edit-mode states — an overlay div inside each section (tessera v6, 2026-10-08, from
      // page-edit.html; pre-v6 frozen in src/themes/_legacy/pages.js `sectionArray`). Neutral, no
      // accent: hover = strong rule, being edited = dashed ink, #hash target = dashed amber.
      sectionEditHover: 'absolute inset-0 border-2 border-transparent group-hover:border-[var(--t-rule-strong)] pointer-events-none z-10 rounded-lg',
      sectionEditing: 'absolute inset-0 border-2 border-dashed border-[var(--t-ink)] pointer-events-none z-10 rounded-lg',
      // URL-hash target (#<section id>) — the same overlay in view and edit mode.
      sectionHighlight: 'absolute inset-0 border-2 border-dashed border-[var(--t-amber)] pointer-events-none z-10 rounded-lg', // on scroll url hash
      sectionViewWrapper: 'relative group',
      sectionPadding: 'p-4',
      defaultPaddingStep: '4',      // per-side gutter default (matches the old p-4 spacing)
      // Layout-grid overlay (EditPane grid toggle): one dashed column per grid track.
      gridviewGrid: 'z-0 h-full',
      gridviewItem: 'h-full border-x border-dashed border-[var(--t-rule-strong)] bg-[var(--t-well)] opacity-50',
      defaultOffset: 16,
      // "+ add" at each section's top edge (on hover): rule · pill · rule. The pill shows "Add"
      // when hovered.
      addSectionButton: 'absolute -top-3 left-0 right-0 z-20 hidden group-hover:flex items-center gap-2 px-3',
      spacer: 'h-px flex-1 bg-[var(--t-rule-strong)]',
      addSectionIconWrapper: 'group/icon inline-flex items-center gap-1 h-6 pl-1 pr-1 hover:pr-2.5 rounded-full border border-[var(--t-rule-strong)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer',
      addSectionIcon: 'size-4',
      addSectionTextWrapper: 'hidden group-hover/icon:flex items-center',
      addSectionText: 't-metaXS',
      // The add button after the last section — always visible ('' → addSectionButton inside a
      // 'p-[1px]' box, i.e. only on hover, the pre-v6 behaviour).
      addSectionEndWrapper: 'relative h-10',
      addSectionEndButton: 'absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2 px-3',
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
      // v6 2026-10-08: the brand line is the --t-rule token (was #E0EBF0).
      border: {
          none: '',
          full: 'border border-[var(--t-rule)] rounded-lg',
          openLeft: 'border border-[var(--t-rule)] border-l-transparent rounded-r-lg',
          openRight: 'border border-[var(--t-rule)] border-r-transparent rounded-l-lg',
          openTop: 'border border-[var(--t-rule)] border-t-transparent rounded-b-lg',
          openBottom: 'border border-[var(--t-rule)] border-b-transparent rounded-t-lg',
          borderX: 'border border-[var(--t-rule)] border-y-transparent'
      },
      // ── Compound-card per-edge controls (literal classes so Tailwind generates
      // them; the picker offers these, the render composes the chosen ones). ──
      // Per-side border toggles against the one brand line.
      borderSides: {
          top:    'border-t border-[var(--t-rule)]',
          right:  'border-r border-[var(--t-rule)]',
          bottom: 'border-b border-[var(--t-rule)]',
          left:   'border-l border-[var(--t-rule)]',
      },
      // Per-corner radius toggles (one brand corner size).
      radiusCorners: {
          tl: 'rounded-tl-lg', tr: 'rounded-tr-lg', bl: 'rounded-bl-lg', br: 'rounded-br-lg',
      },
      // Per-side border WIDTH steps (px) offered by the section-menu Border control.
      // A section that sets `border.width` renders via inline style (not a class), so
      // these are plain numbers, not Tailwind utilities. Override per-theme if desired.
      borderWidths: [1, 2, 3, 4, 6, 8],
      // Curated swatch palette for the section Border COLOR picker — brand line +
      // accent colors. Seeded into ColorControls' `colors` prop so authors pick "from
      // theme colors". A section that sets `border.color` renders via inline style.
      borderColors: [
          '#E0EBF0', // default brand line (matches borderSides)
          '#C5D7E0',
          '#6D96AE',
          '#37576B',
          '#2D3E4C',
          '#1F3F8F', // brand blue
          '#EAAD43', // amber accent
          '#B42318', // red
          '#067647', // green
      ],
      // Inner-card background options (the per-side border carries no bg of its own).
      // v6: white → the panel token, tint → the well token (dark-mode aware).
      backgrounds: {
          none: '', white: 'bg-[var(--t-panel)]', tint: 'bg-[var(--t-well)]',
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
