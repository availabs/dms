import React from 'react'

// Style keys beyond wrapper1/2/3:
//   decorations: [classString] — empty spans rendered inside wrapper1 (chrome).
//   Background: React component — a live backdrop (canvas, texture) rendered
//     inside wrapper1 before the content wrappers. The component positions
//     itself (absolute inset-0, aria-hidden); wrapper1 supplies
//     relative/overflow-hidden. Site themes supply this from their own code.
export const layoutGroupTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
     {
      name: "content",
      wrapper1: 'w-full flex flex-row border-b border-[var(--t-rule)] t6-band-content', // inside page header, wraps sidebar
      wrapper2: 'flex flex-1 w-full flex-col relative max-w-[1200px] mr-auto t6-band-inner pl-6 lg:pl-12 pr-6 lg:pr-8 py-8 font-sans text-base font-normal leading-relaxed text-[var(--t-ink)] min-h-[100px]', // content wrapper
      wrapper3: '',
      decorations: ['t6-joint t6-joint-rail-bl', 't6-joint t6-joint-rail-br']
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
      // adminContent — matches patternEditor.theme.js's own `content` padding
      // (p-5 lg:p-8, no max-width cap) exactly, so every admin/auth-manage page
      // gets the SAME gutter around its title as the Pattern Editor's own pages
      // (Overview, Pages, …) instead of this style's much bigger `content`
      // band padding (py-8, pl-6/lg:pl-12) — used by admin's Sites/Themes list
      // and the auth pattern's Profile/Users/Groups manage pages, which were
      // stacking THIS style's padding underneath their own (flagged live,
      // 2026-09-21 — "more padding than they need... overview page is a good
      // ref of how much it should be").
      name: "adminContent",
      // No max-width — Sites/Themes/Users/Groups/Profile should render full
      // width, matching the Pattern Editor's own pages (2026-09-22). This used
      // to keep `max-w-[1200px]` as "cheap insurance" against a real overflow
      // bug (Layout's `childWrapper` lacked `min-w-0`, so a wide child like
      // Sites' Table pushed the whole Layout past the viewport) — that's now
      // fixed at the source in Layout.theme.jsx's `childWrapper`, so the cap
      // here is no longer needed.
      wrapper1: 'w-full flex-1 flex flex-row min-w-0',
      wrapper2: 'flex flex-1 w-full min-w-0 flex-col relative p-5 lg:p-8 font-sans text-base font-normal leading-relaxed text-[var(--t-ink)] min-h-[100px]',
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
