const navigableMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // Trigger button
    "button": "px-1 py-0.5",
    "buttonHidden": "hidden group-hover:flex",
    "icon": "Menu",
    "iconWrapper": "size-4",

    // Menu container
    "menuWrapper": "bg-white border w-80 p-1 min-h-[75px] rounded-md shadow-md",

    // Menu header
    "menuHeaderWrapper": "flex px-2 py-1 justify-between",
    "menuHeaderContent": "flex gap-2 items-center w-full",
    "menuTitle": "font-semibold text-gray-900",
    "backButton": "w-fit",
    "backIcon": "ArrowLeft",
    "backIconWrapper": "size-4",
    "closeButton": "w-fit",
    "menuCloseIcon": "XMark",
    "menuCloseIconWrapper": "hover:cursor-pointer size-4",

    // Menu items
    "menuItemsWrapper": "max-h-[80vh] overflow-y-auto scrollbar-sm",
    "menuItem": "group flex items-center justify-between px-2 py-1 rounded-md text-sm text-slate-800",
    "menuItemHover": "hover:bg-blue-300",
    "menuItemIconLabelWrapper": "flex flex-grow items-center gap-1",
    "menuItemIconWrapper": "size-5 stroke-slate-500 group-hover:stroke-slate-800",
    "menuItemLabel": "",
    "menuItemLabelLink": "cursor-pointer",

    // Submenu indicators
    "subMenuIcon": "ArrowRight",
    "subMenuIconWrapper": "place-self-center",
    "valueSubmenuIconWrapper": "flex gap-0.5",
    "valueWrapper": "p-0.5 rounded-md bg-gray-100 text-gray-900 text-sm",

    // Separator
    "separator": "w-full border-b"
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
          type: 'Select',
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
