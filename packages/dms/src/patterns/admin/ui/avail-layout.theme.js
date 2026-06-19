export const adminLayoutTheme = {
    root: 'flex',
    sidebarContainer: 'hidden md:block',
    sidebarInner: 'fixed h-screen',
    contentWrapper: 'flex-1 flex items-start flex-col items-stretch w-full min-h-screen',
    topNavSticky: 'sticky top-0 z-20 w-full',
    topNavBlock: 'z-10',
    contentInner: 'flex-1',
    topMenuWrapper: 'flex flex-row md:flex-col',
    bottomMenuWrapper: 'flex flex-row md:flex-col',
    leftMenuWrapper: 'flex flex-col md:flex-row',
    rightMenuWrapper: 'flex flex-col md:flex-row',

    // Size maps (used as marginSizes / fixedSizes lookup)
    sidebarMargin: {
        none: '',
        micro: 'mr-14',
        mini: 'mr-20',
        miniPad: 'mr-0',
        compact: 'mr-44',
        full: 'mr-64',
    },
    sidebarWidth: {
        none: '',
        micro: 'w-14',
        mini: 'w-20',
        miniPad: 'w-0',
        compact: 'w-44',
        full: 'w-64',
    },
}
