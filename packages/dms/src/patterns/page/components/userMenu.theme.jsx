export const userMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      // UserMenu component
      userMenuContainer: 'flex flex-1 w-full items-center justify-center rounded-xl min-w-[60px] @container',
      avatarWrapper: 'flex p-2 justify-center items-center',
      avatar: 'size-8 border border-[#E0EBF0] rounded-full flex items-center justify-center hover:bg-slate-400',
      avatarIcon: 'size-6 fill-[#37576b]',
      infoWrapper: 'flex-1 p-2 @max-[150px]:hidden',
      emailText: 'text-xs font-thin tracking-tighter text-left',
      groupText: 'text-xs font-medium -mt-1 tracking-widest text-left',

      // Sync status ring on the avatar
      syncRing: 'ring-2 ring-offset-1 ring-offset-white',
      syncRingConnected: 'ring-emerald-500',
      syncRingSyncing: 'ring-amber-400',
      syncRingRecovering: 'ring-orange-500',
      syncRingError: 'ring-red-500',
      syncRingDisconnected: 'ring-slate-300',

      // Sync status row inside the dropdown menu
      syncStatusWrapper: 'flex items-center gap-2 px-3 py-2 text-xs text-slate-500',
      syncStatusDot: 'size-2 rounded-full flex-shrink-0',
      syncStatusLabel: 'flex-1',
      syncDotConnected: 'bg-emerald-500',
      syncDotSyncing: 'bg-amber-400',
      syncDotRecovering: 'bg-orange-500',
      syncDotError: 'bg-red-500',
      syncDotDisconnected: 'bg-slate-300',
      syncCollabWrapper: 'flex items-center gap-1 text-blue-600',
      syncCollabIcon: 'size-3',

      // EditControl component
      editControlWrapper: 'flex justify-center items-center p-2',
      iconWrapper: 'size-9 flex items-center justify-center',
      icon: 'text-slate-400 hover:text-blue-500 size-7',
      viewIcon: 'ViewPage',
      editIcon: 'EditPage',

      // Login/Auth section
      loginWrapper: 'flex items-center justify-center py-2',
      loginLink: 'flex items-center',
      loginIconWrapper: 'size-8 flex items-center justify-center border border-[#E0EBF0] rounded-full hover:bg-slate-400',
      loginIcon: 'size-6 stroke-slate-500 text-slate-500',
      loginText: 'hidden',
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
    "syncRing",
    "syncRingConnected",
    "syncRingSyncing",
    "syncRingRecovering",
    "syncRingError",
    "syncRingDisconnected",
    "syncStatusWrapper",
    "syncStatusDot",
    "syncStatusLabel",
    "syncDotConnected",
    "syncDotSyncing",
    "syncDotRecovering",
    "syncDotError",
    "syncDotDisconnected",
    "syncCollabWrapper",
    "syncCollabIcon",
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
    "loginText",
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
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
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
