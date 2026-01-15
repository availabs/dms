export const userMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      // UserMenu component
      userMenuContainer: 'flex w-full items-center justify-center rounded-xl min-w-[60px] @container',
      avatarWrapper: 'flex p-2 justify-center items-center',
      avatar: 'size-8 border-2 border-[#E0EBF0] rounded-full place-items-center content-center',
      avatarIcon: 'size-6 fill-[#37576b]',
      infoWrapper: 'flex-1 p-2 @max-[150px]:hidden',
      emailText: 'text-xs font-thin tracking-tighter text-left',
      groupText: 'text-xs font-medium -mt-1 tracking-widest text-left',

      // EditControl component
      editControlWrapper: 'flex justify-center items-center p-2',
      iconWrapper: 'size-9 flex items-center justify-center',
      icon: 'text-slate-400 hover:text-blue-500 size-7',
      viewIcon: 'ViewPage',
      editIcon: 'EditPage',

      // Login/Auth section
      loginWrapper: 'flex items-center justify-center py-2',
      loginLink: 'flex items-center',
      loginIconWrapper: 'size-8 rounded-lg place-items-center content-center',
      loginIcon: 'size-6 fill-[#37576b] hover:fill-slate-500',
      authContainer: '@container w-full',
      authWrapper: 'flex p-1 items-center',
      userMenuWrapper: 'flex items-center flex-1 w-full',
    }
  ]
}


const themeClasses = {
  "userMenu": [
    "userMenuContainer",
    "avatarWrapper",
    "avatar",
    "avatarIcon",
    "infoWrapper",
    "emailText",
    "groupText",
  ],
  "editControl": [
    "editControlWrapper",
    "iconWrapper",
    "icon",
    "viewIcon",
    "editIcon",
  ],
  "auth": [
    "loginWrapper",
    "loginLink",
    "loginIconWrapper",
    "loginIcon",
    "authContainer",
    "authWrapper",
    "userMenuWrapper",
  ]
}

export const userMenuSettings = (theme) => {
  const activeStyle = theme?.pages?.userMenu?.options?.activeStyle || 0
  return [
    {
      label: "User Menu Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.pages?.userMenu?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.userMenu.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: <div>Add Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              draft.pages.userMenu.styles.push({ ...draft.pages.userMenu.styles[0], name: 'new style' })
            })
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: <div>Remove Style</div>,
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.pages.userMenu.styles.length > 1) {
                draft.pages.userMenu.styles.splice(activeStyle, 1)
                draft.pages.userMenu.options.activeStyle = 0
              }
            })
          }
        },
      ]
    },
    {
      label: "User Menu",
      type: 'inline',
      controls: themeClasses.userMenu
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.userMenu.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Edit Control",
      type: 'inline',
      controls: themeClasses.editControl
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.userMenu.styles[${activeStyle}].${k}`
          }
        })
    },
    {
      label: "Auth/Login",
      type: 'inline',
      controls: themeClasses.auth
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `pages.userMenu.styles[${activeStyle}].${k}`
          }
        })
    }
  ]
}
