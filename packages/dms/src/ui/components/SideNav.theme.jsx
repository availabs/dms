const sideNavTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      // Layout containers
      layoutContainer1: 'lg:pl-60',
      layoutContainer2: 'fixed inset-y-0 left-0 w-60 max-lg:hidden',
      // Logo area
      logoWrapper: "flex items-center h-14 px-4 border-b border-[var(--t-rule)] bg-[var(--t-paper)]",
      // Main sidebar wrapper
      sidenavWrapper: "flex flex-col w-60 h-full bg-[var(--t-paper)] border-r border-[var(--t-rule)]",
      // Menu structure
      menuItemWrapper: "flex flex-1 flex-col gap-px",
      menuItemWrapper_level_1: '',
      menuItemWrapper_level_2: 'ml-4 border-l border-[var(--t-rule)]',
      menuItemWrapper_level_3: 'ml-4 border-l border-[var(--t-rule)]',
      menuItemWrapper_level_4: 'ml-4',
      // Nav items
      navitemSide: `
        group w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-normal text-[var(--t-graphite)]
        hover:bg-[var(--t-well)] hover:text-[var(--t-ink)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive: `
        group w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-medium text-[var(--t-cobalt)]
        bg-[var(--t-cobalt-soft)]
        cursor-pointer`,
      // Depth-2/3/4 variants use a NAMED group (`group/lvl2` etc.) instead of
      // the plain `group` every level shares by default. A submenu item's row
      // nests inside its parent's own `group`-classed row (SideNavItem renders
      // SubMenu's children inside the parent's own wrapper) — CSS `:hover`
      // bubbles up through ancestors, so hovering ANY child also puts the
      // parent's plain `.group` into `:hover`, and `.group:hover .icon` then
      // matches every sibling icon under that same parent, not just the one
      // under the cursor (the "hovering one item highlights all its siblings'
      // icons" bug, found 2026-09-17). A depth-specific name scopes the
      // selector to that level's own row only, since it no longer matches the
      // ancestor's unnamed `.group`.
      navitemSide_level_2: `
        group/lvl2 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-normal text-[var(--t-graphite)]
        hover:bg-[var(--t-well)] hover:text-[var(--t-ink)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_2: `
        group/lvl2 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-medium text-[var(--t-cobalt)]
        bg-[var(--t-cobalt-soft)]
        cursor-pointer`,
      navitemSide_level_3: `
        group/lvl3 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-normal text-[var(--t-graphite)]
        hover:bg-[var(--t-well)] hover:text-[var(--t-ink)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_3: `
        group/lvl3 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-medium text-[var(--t-cobalt)]
        bg-[var(--t-cobalt-soft)]
        cursor-pointer`,
      navitemSide_level_4: `
        group/lvl4 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-normal text-[var(--t-graphite)]
        hover:bg-[var(--t-well)] hover:text-[var(--t-ink)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_4: `
        group/lvl4 w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-md
        font-sans text-sm font-medium text-[var(--t-cobalt)]
        bg-[var(--t-cobalt-soft)]
        cursor-pointer`,
      // Icons
      menuIconSide: "w-4 h-4 text-[var(--t-graphite)] group-hover:text-[var(--t-ink)] transition-colors duration-150",
      menuIconSideActive: "w-4 h-4 text-[var(--t-cobalt)]",
      // Matching named group-hover for the level_2/3/4 rows above.
      menuIconSide_level_2: "w-4 h-4 text-[var(--t-graphite)] group-hover/lvl2:text-[var(--t-ink)] transition-colors duration-150",
      menuIconSide_level_3: "w-4 h-4 text-[var(--t-graphite)] group-hover/lvl3:text-[var(--t-ink)] transition-colors duration-150",
      menuIconSide_level_4: "w-4 h-4 text-[var(--t-graphite)] group-hover/lvl4:text-[var(--t-ink)] transition-colors duration-150",
      // Forced icon (displayed when navItem has no icon)
      forcedIcon: "",
      forcedIcon_level_1: "",
      forcedIcon_level_2: "",
      forcedIcon_level_3: "",
      forcedIcon_level_4: "",
      // Items container
      itemsWrapper: "flex-1 overflow-y-auto px-2 py-4",
      // The icon + label + submenu-indicator row inside a nav item. Needs its
      // own gap — `navitemSide`'s gap-2.5 lives one level up (on the row that
      // wraps this plus the submenu itself), so it never reached the icon and
      // label, which sat flush against each other.
      navItemRow: "flex-1 flex items-center justify-between gap-2.5",
      // Nav item content
      navItemContent: "flex items-center gap-2 flex-1",
      navItemContent_level_1: '',
      navItemContent_level_2: 'font-sans text-sm font-normal',
      navItemContent_level_3: 'font-sans text-sm font-normal',
      navItemContent_level_4: 'font-sans text-xs font-normal',
      // Indicator icons for expandable items. Plain "Arrow*" — despite the
      // name these ARE simple chevron carets (icons/icon_defs.jsx); there is
      // no registered "ChevronRight"/"ChevronDown" (only the boxed
      // "ChevronDownSquare"/"ChevronUpSquare"), so that used to silently miss
      // the registry and fall through to Icon.jsx's generic DefaultIcon glyph
      // — SideNavItem's OWN inline fallback (`theme?.indicatorIcon ||
      // 'ArrowDown'`) already assumed these exact names (2026-09-20).
      indicatorIcon: "ArrowRight",
      indicatorIconOpen: "ArrowDown",
      indicatorIconWrapper: "w-4 h-4 text-[var(--t-pencil)] transition-transform duration-150",
      // Submenu wrappers
      subMenuWrapper_1: "mt-px space-y-px",
      subMenuWrapper_2: "mt-px space-y-px",
      subMenuWrapper_3: "mt-px space-y-px",
      subMenuOuterWrapper: '',
      subMenuParentWrapper: "flex flex-col",
      subMenuTitle: 'hidden',
      // Bottom section (user menu, etc.)
      bottomMenuWrapper: 'mt-auto border-t border-[var(--t-rule)] px-5 py-1 bg-[var(--t-paper)] flex flex-col items-start gap-2.5',
      // Section divider
      sectionDivider: 'my-3 border-t border-[var(--t-rule)]',
      // Section heading
      sectionHeading: 'px-2 pb-2 pt-4 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t-pencil)]',
      // Topnav styles (for mobile toggle)
      topnavWrapper: `w-full h-14 flex items-center px-4`,
      topnavContent: `flex items-center w-full h-full bg-[var(--t-paper)] justify-between`,
      topnavMenu: `hidden lg:flex items-center flex-1 h-full overflow-visible`,
      topmenuRightNavContainer: "flex items-center gap-2",
      topnavMobileContainer: "bg-[var(--t-paper)] border-b border-[var(--t-rule)]"
    },
    // Matches the admin mockups' "control room" rail (design_system_v6/pages/
    // admin-*.html) — mono `t-metaMD` labels + a left-rule active state,
    // instead of 'default''s docs-site look (font-sans, rounded pill). Only
    // the keys that actually differ are listed — getComponentTheme fills in
    // everything else (logoWrapper, itemsWrapper, icons, submenu wrappers,
    // topnav mobile fallback, …) from styles[0] automatically. Selected via
    // `sideNavActiveStyle="admin"` on the admin/manage-pages <Layout>s
    // (patterns/admin/siteConfig.jsx, patterns/auth/siteConfig.jsx's
    // AdminLayout) — 2026-09-20.
    {
      name: 'admin',
      navitemSide: `
        group w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-transparent
        t-metaMD text-[var(--t-graphite)]
        hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive: `
        group w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]
        t-metaMD text-[var(--t-cobalt)]
        cursor-pointer`,
      navitemSide_level_2: `
        group/lvl2 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-transparent
        t-metaMD text-[var(--t-graphite)]
        hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_2: `
        group/lvl2 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]
        t-metaMD text-[var(--t-cobalt)]
        cursor-pointer`,
      navitemSide_level_3: `
        group/lvl3 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-transparent
        t-metaMD text-[var(--t-graphite)]
        hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_3: `
        group/lvl3 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]
        t-metaMD text-[var(--t-cobalt)]
        cursor-pointer`,
      navitemSide_level_4: `
        group/lvl4 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-transparent
        t-metaMD text-[var(--t-graphite)]
        hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]
        cursor-pointer transition-colors duration-150`,
      navitemSideActive_level_4: `
        group/lvl4 w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5
        border-l-2 border-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)]
        t-metaMD text-[var(--t-cobalt)]
        cursor-pointer`,
      // navItemContent_level_2/3/4's `default` style hardcodes font-sans —
      // it sits on the INNER Link/label div, nested inside navitemSide_level_N
      // above, so its own font-family class would otherwise win over the
      // ancestor's t-metaMD.
      navItemContent_level_2: 't-metaMD',
      navItemContent_level_3: 't-metaMD',
      navItemContent_level_4: 't-metaMD',
      // A navItem with no path/onClick/subMenus renders as this plain,
      // inert label (SideNavItem's "label row" branch) — used for a group
      // heading like "pattern · <name>" above a pattern's own tab links
      // (patterns/admin/siteConfig.jsx's patternConfig). No theme set this
      // before now (2026-09-20) — matches design_system_v6's own
      // `t-metaXS text-pencil px-3 pt-5 pb-1.5 truncate` group-heading style.
      navLabel: 't-metaXS text-[var(--t-pencil)] px-3 pt-5 pb-1.5 truncate',
    },
  ]
}

export default sideNavTheme

export const sideNavsettings =  (theme) => [
  {
    label: "Sidenav Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
        options: (theme?.sidenav?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `sidenav.options.activeStyle`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.sidenav.styles.push({ ...draft.sidenav.styles[0], name: 'new style', })
            //draft.sidenav.options.activeStyle = draft.sidenav.styles.length
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
            if (draft.sidenav.styles.length > 1) {
              draft.sidenav.styles.splice(theme.sidenav.options.activeStyle, 1)
              draft.sidenav.options.activeStyle = 0
            }
          })
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
    ]
  },
  {
    label: "Side Nav",
    type: 'inline',
    controls: [
      ...Object.keys(theme?.sidenav?.styles?.[theme?.sidenav?.options?.activeStyle || 0] )
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `sidenav.styles[${theme?.sidenav?.options?.activeStyle}].${k}`
          }
        })
    ]
  }
]
// const sideNavTheme = {
//   fixed: "lg:ml-42",
//   logoWrapper: "w-42 bg-neutral-100 text-slate-800",
//   sidenavWrapper: "flex flex-col w-42 h-full z-20",
//   menuItemWrapper: "flex flex-col ",
//   menuIconSide: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//   menuIconSideActive: "group w-6 mr-2 text-blue-500  group-hover:text-blue-800",
//   itemsWrapper: "pt-12 flex-1 ",
//   navItemContent: "transition-transform duration-300 ease-in-out",
//   navitemSide: `
//    group  flex flex-col
//    group flex px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700 mx-2  undefined
//    focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    transition-all cursor-pointer`,
//   navitemSideActive: `
//    group  flex flex-col
//    px-3 py-1.5 text-[14px] font-light hover:bg-blue-50 text-slate-700  mx-2
//      focus:outline-none focus:text-gray-800 focus:bg-gray-50 focus:border-gray-300
//    transition-all cursor-pointer`,
//   indicatorIcon: "ArrowRight",
//   indicatorIconOpen: "ArrowDown",
//   subMenuWrapper: "pl-2 w-full",
//   subMenuParentWrapper: "flex flex-col w-full",
//   bottomMenuWrapper: 'border-t'
// }
