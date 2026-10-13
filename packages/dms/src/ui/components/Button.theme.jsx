import React from 'react'

// The v6 control looks (2026-10-13, planning/tasks/current/ui-control-consistency-audit.md; spec:
// src/themes/tessera/design_system_v6/pages/ui-controls.html). Kept here, with the component — pattern
// themes that need the same look copy the string into their own theme file.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';
const BTN = `inline-flex items-center justify-center gap-1.5 rounded-md border whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const LINK = `inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS} rounded-sm`;
const CHIP_BASE = `inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border t-metaXS cursor-pointer transition-colors ${FOCUS}`;
const PRIMARY = `${BTN} h-8 px-3.5 t-proseSM font-medium border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)] hover:bg-[var(--t-graphite)] hover:border-[var(--t-graphite)]`;
const ACTION = `${BTN} h-8 px-3 t-proseSM border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const DANGER = `${BTN} h-8 px-3 t-proseSM border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const DANGER_SOLID = `${BTN} h-8 px-3 t-proseSM font-medium border-[var(--t-brick)] bg-[var(--t-brick)] text-[var(--t-accent-ink)] hover:opacity-90`;
const SMALL = `${BTN} h-6 px-2.5 t-metaXS border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]`;
const SMALL_DANGER = `${BTN} h-6 px-2.5 t-metaXS border-[var(--t-brick)] bg-[var(--t-panel)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const ICON_TOOL = `${BTN} size-8 border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const ICON_ROW = `${BTN} size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]`;
const ICON_ROW_DANGER = `${BTN} size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const LINK_META = `${LINK} t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-ink)]`;
const LINK_META_DANGER = `${LINK} t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-brick)]`;
const LINK_PROSE = `${LINK} t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]`;
const CHIP = `${CHIP_BASE} border-[var(--t-rule)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]`;
const CHIP_ON = `${CHIP_BASE} border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)]`;

export const buttonTheme = {
  options: {
    activeStyle:0
  },
  styles: [
    {
      // v6 (2026-10-13, ui-control-consistency-audit.md P1): the bare UI.Button is the ink primary —
      // the same role every unstyled button had (it was solid cobalt). Secondary buttons opt into
      // activeStyle='action' page by page. Project themes keep the old cobalt via src/themes/_legacy/ui.js.
      name: 'default Buttons',
      button: PRIMARY,
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
    },
    // ── named styles (2026-10-13) — the v6 looks defined at the top of this file; pick with activeStyle='<name>'.
    // Appended after 'plain' / 'active' so stored style indices don't move.
    { name: 'primary',        button: PRIMARY },
    { name: 'action',         button: ACTION },
    { name: 'danger',         button: DANGER },
    { name: 'dangerSolid',    button: DANGER_SOLID },
    { name: 'small',          button: SMALL },
    { name: 'smallDanger',    button: SMALL_DANGER },
    { name: 'iconTool',       button: ICON_TOOL },
    { name: 'iconRow',        button: ICON_ROW },
    { name: 'iconRowDanger',  button: ICON_ROW_DANGER },
    { name: 'linkMeta',       button: LINK_META },
    { name: 'linkMetaDanger', button: LINK_META_DANGER },
    { name: 'linkProse',      button: LINK_PROSE },
    { name: 'chip',           button: CHIP },
    { name: 'chipOn',         button: CHIP_ON },
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
      ...Object.keys(theme?.button?.styles?.[theme?.button?.options?.activeStyle || 0] || {} )
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
