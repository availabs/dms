export const userMenuTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: 'default',
      // tessera v6, 2026-10-08 (page-view.html / page-edit.html user menu): neutral chrome,
      // the avatar ring carries sync status, no accent colour. Pre-v6 values are frozen in
      // src/themes/_legacy/pages.js `userMenu`.

      // UserMenu component (avatar + identity) — the dropdown trigger
      userMenuContainer: 'flex flex-1 min-w-0 items-center gap-2',
      avatarWrapper: 'flex shrink-0 justify-center items-center',
      avatar: 'size-8 shrink-0 rounded-full border border-[var(--t-rule-strong)] bg-[var(--t-panel)] flex items-center justify-center',
      avatarIcon: 'size-4 text-[var(--t-graphite)] fill-current',
      infoWrapper: 'flex-1 min-w-0 text-left',
      emailText: 't-metaXS normal-case tracking-normal text-[var(--t-ink)] truncate',
      groupText: 't-metaXS text-[var(--t-pencil)] truncate',

      // Sync status ring on the avatar
      syncRing: 'ring-2 ring-offset-2 ring-offset-[var(--t-paper)]',
      syncRingConnected: 'ring-[var(--t-go)]',
      syncRingSyncing: 'ring-[var(--t-amber)]',
      syncRingRecovering: 'ring-[var(--t-amber)]',
      syncRingError: 'ring-[var(--t-brick)]',
      syncRingDisconnected: 'ring-[var(--t-rule-strong)]',
      // Overrides the status ring when this page's live-edit room differs from
      // its saved sections (sync/room-health.js) — a save here would revert them.
      syncRingStale: 'ring-[var(--t-brick)]',

      // Sync status row inside the dropdown menu
      syncStatusWrapper: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS text-[var(--t-graphite)]',
      syncStatusDot: 'size-2 rounded-full flex-shrink-0',
      syncStatusLabel: 'flex-1',
      syncDotConnected: 'bg-[var(--t-go)]',
      syncDotSyncing: 'bg-[var(--t-amber)]',
      syncDotRecovering: 'bg-[var(--t-amber)]',
      syncDotError: 'bg-[var(--t-brick)]',
      syncDotDisconnected: 'bg-[var(--t-rule-strong)]',
      syncCollabWrapper: 'inline-flex items-center gap-1 text-[var(--t-graphite)]',
      syncCollabIcon: 'size-3',

      // "Clear pending mutations" action row, right below the sync status row.
      // Disabled (no click, dimmed) whenever there's nothing stuck to clear.
      syncClearWrapper: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS text-[var(--t-graphite)] rounded cursor-pointer hover:bg-[var(--t-well)]',
      syncClearWrapperDisabled: 'opacity-40 cursor-not-allowed hover:bg-transparent',
      syncClearLabel: 'flex-1',

      // "Discard local data" action row, right below "Clear pending mutations".
      // Disabled while offline (nothing to reload from) or already discarding.
      syncDiscardWrapper: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS font-medium text-[var(--t-brick)] rounded cursor-pointer hover:bg-[var(--t-brick-soft)]',
      syncDiscardWrapperDisabled: 'opacity-40 cursor-not-allowed hover:bg-transparent',
      syncDiscardLabel: 'flex-1',

      // Page room health rows (sync/room-health.js): status line + actions.
      syncRoomWrapper: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS text-[var(--t-graphite)]',
      syncRoomStaleWrapper: 'flex items-start gap-2 px-2.5 py-1.5 t-proseXS text-[var(--t-brick)]',
      syncRoomIcon: 'size-3 flex-shrink-0',
      syncRoomLabel: 'flex-1',
      syncRoomAction: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS text-[var(--t-graphite)] rounded cursor-pointer hover:bg-[var(--t-well)]',
      syncRoomRepair: 'flex items-center gap-2 px-2.5 py-1.5 t-proseXS font-medium text-[var(--t-brick)] rounded cursor-pointer hover:bg-[var(--t-brick-soft)]',
      syncRoomActionDisabled: 'opacity-40 cursor-not-allowed hover:bg-transparent',

      // "Viewing as <email>" line in the menu while an admin views as another user
      viewAsText: 'px-2.5 py-1 t-proseXS font-medium text-[var(--t-amber)] truncate max-w-[200px]',

      // EditControl component (the edit ⇄ view page toggle)
      editControlWrapper: 'flex shrink-0 justify-center items-center',
      iconWrapper: 'size-8 shrink-0 flex items-center justify-center rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] transition-colors',
      icon: 'size-4',
      viewIcon: 'ViewPage',
      editIcon: 'EditPage',

      // Login/Auth section
      loginWrapper: 'flex items-center justify-center',
      loginLink: 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] transition-colors',
      loginIconWrapper: 'size-8 flex items-center justify-center',
      loginIcon: 'size-4 text-[var(--t-graphite)]',
      loginText: '',
      authContainer: 'w-full min-w-0',
      authWrapper: 'flex items-center gap-2 w-full min-w-0',
      userMenuWrapper: 'flex flex-1 min-w-0 items-center rounded-md p-1 -m-1 cursor-pointer hover:bg-[var(--t-well)] transition-colors',
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
    "syncRingStale",
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
    "syncClearWrapper",
    "syncClearWrapperDisabled",
    "syncClearLabel",
    "syncDiscardWrapper",
    "syncDiscardWrapperDisabled",
    "syncDiscardLabel",
    "syncRoomWrapper",
    "syncRoomStaleWrapper",
    "syncRoomIcon",
    "syncRoomLabel",
    "syncRoomAction",
    "syncRoomRepair",
    "syncRoomActionDisabled",
    "viewAsText",
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
