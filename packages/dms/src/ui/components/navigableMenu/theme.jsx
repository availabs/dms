const navigableMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // Trigger button
    "button": "inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--t-well)] cursor-pointer transition-colors duration-150",
    "buttonHidden": "flex sm:hidden group-hover:flex",
    "icon": "Menu",
    "iconWrapper": "w-4 h-4 stroke-[var(--t-ink)]",

    // Menu container
    "menuWrapper": "bg-[var(--t-panel)] border border-[var(--t-rule)] min-w-[16rem] p-1 rounded-lg shadow-[var(--t-shadow-drag)]",

    // Menu header
    "menuHeaderWrapper": "flex px-2 py-1 justify-between",
    "menuHeaderContent": "flex gap-2 items-center w-full",
    "menuTitle": "font-semibold text-gray-900",
    "backButton": "w-fit",
    "backIcon": "ArrowLeft",
    "backIconWrapper": "size-4",
    "closeButton": "w-fit",
    "menuCloseIcon": "XMark",
    "menuCloseIconWrapper": "cursor-pointer w-4 h-4 stroke-[var(--t-graphite)] hover:stroke-[var(--t-ink)]",

    // Menu items
    "menuItemsWrapper": "max-h-[80vh] overflow-y-auto scrollbar-sm",
    "menuItem": "group flex items-center justify-between px-3 py-2 text-sm font-sans text-[var(--t-ink)] cursor-pointer rounded-md",
    "menuItemHover": "hover:bg-[var(--t-well)]",
    "menuItemIconLabelWrapper": "flex flex-grow items-center gap-2",
    "menuItemIconWrapper": "w-4 h-4 stroke-[var(--t-graphite)] group-hover:stroke-[var(--t-ink)]",
    "menuItemLabel": "",
    "menuItemLabelLink": "cursor-pointer",

    // Submenu indicators
    "subMenuIcon": "ChevronRight",
    "subMenuIconWrapper": "place-self-center w-3.5 h-3.5 stroke-[var(--t-pencil)]",
    "valueSubmenuIconWrapper": "flex gap-1 items-center",
    "valueWrapper": "px-1.5 py-0.5 font-mono text-xs text-[var(--t-graphite)] bg-[var(--t-well)] border border-[var(--t-rule)] rounded tabular-nums",

    // Separator
    "separator": "w-full border-b border-[var(--t-rule)] my-1",

    // Breadcrumbs
    "breadcrumbWrapper": "flex items-center flex-wrap gap-1 px-2 py-1 text-sm text-gray-500 overflow-x-auto",
    "breadcrumbItem": "font-semibold text-gray-900 hover:text-blue-500 cursor-pointer whitespace-nowrap",
    "breadcrumbItemActive": "text-gray-700 whitespace-nowrap",
    "breadcrumbSeparator": "text-gray-300"
  }]
}

export default navigableMenuTheme

export const navigableMenuSettings = (theme) => {
  const activeStyle = theme?.navigableMenu?.options?.activeStyle || 0
  return [
    {
      label: "NavigableMenu Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
          options: (theme?.navigableMenu?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `navigableMenu.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.navigableMenu.styles.push({ ...draft.navigableMenu.styles[0], name: 'new style' })
            })
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: <div>Remove Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.navigableMenu.styles.length > 1) {
                draft.navigableMenu.styles.splice(activeStyle, 1)
                draft.navigableMenu.options.activeStyle = 0
              }
            })
          }
        },
      ]
    },
    {
      label: "Button",
      type: 'inline',
      controls: [
        {
          label: 'button',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].button`
        },
        {
          label: 'buttonHidden',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].buttonHidden`
        },
        {
          label: 'icon',
          type: 'Input',
          path: `navigableMenu.styles[${activeStyle}].icon`
        },
        {
          label: 'iconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].iconWrapper`
        },
      ]
    },
    {
      label: "Menu Container",
      type: 'inline',
      controls: [
        {
          label: 'menuWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuWrapper`
        },
      ]
    },
    {
      label: "Menu Header",
      type: 'inline',
      controls: [
        {
          label: 'menuHeaderWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuHeaderWrapper`
        },
        {
          label: 'menuHeaderContent',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuHeaderContent`
        },
        {
          label: 'menuTitle',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuTitle`
        },
        {
          label: 'backButton',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].backButton`
        },
        {
          label: 'backIcon',
          type: 'Input',
          path: `navigableMenu.styles[${activeStyle}].backIcon`
        },
        {
          label: 'backIconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].backIconWrapper`
        },
        {
          label: 'closeButton',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].closeButton`
        },
        {
          label: 'menuCloseIcon',
          type: 'Input',
          path: `navigableMenu.styles[${activeStyle}].menuCloseIcon`
        },
        {
          label: 'menuCloseIconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuCloseIconWrapper`
        },
      ]
    },
    {
      label: "Menu Items",
      type: 'inline',
      controls: [
        {
          label: 'menuItem',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItem`
        },
        {
          label: 'menuItemHover',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItemHover`
        },
        {
          label: 'menuItemIconLabelWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItemIconLabelWrapper`
        },
        {
          label: 'menuItemIconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItemIconWrapper`
        },
        {
          label: 'menuItemLabel',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItemLabel`
        },
        {
          label: 'menuItemLabelLink',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].menuItemLabelLink`
        },
      ]
    },
    {
      label: "Submenu & Values",
      type: 'inline',
      controls: [
        {
          label: 'subMenuIcon',
          type: 'Input',
          path: `navigableMenu.styles[${activeStyle}].subMenuIcon`
        },
        {
          label: 'subMenuIconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].subMenuIconWrapper`
        },
        {
          label: 'valueSubmenuIconWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].valueSubmenuIconWrapper`
        },
        {
          label: 'valueWrapper',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].valueWrapper`
        },
        {
          label: 'separator',
          type: 'Textarea',
          path: `navigableMenu.styles[${activeStyle}].separator`
        },
      ]
    }
  ]
}

export const docs = []
