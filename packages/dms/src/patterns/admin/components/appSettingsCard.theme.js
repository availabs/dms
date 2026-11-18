// AppSettingsCard (components/appSettingsCard.jsx): a site's icon, app name and colours, on the tenant's
// settings page (site-app-settings-pwa.md). Same card frame and Tessera tokens as pgEnvsCard.theme.js.
export const appSettingsCardTheme = {
    card: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    cardHeader: 'px-4 py-2.5 border-b border-[var(--t-rule)] flex flex-wrap items-center gap-2',
    cardTitle: 't-metaSM text-[var(--t-graphite)]',
    cardSubtitle: 't-metaXS text-[var(--t-pencil)]',
    body: 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem] gap-6 px-4 py-4',
    form: 'flex flex-col gap-4 min-w-0',
    field: 'flex flex-col gap-1.5',
    label: 't-metaXS text-[var(--t-graphite)]',
    help: 't-metaXS text-[var(--t-pencil)]',
    pair: 'grid grid-cols-1 sm:grid-cols-2 gap-4',

    // the icon: its tile, then the upload / remove buttons
    iconRow: 'flex flex-wrap items-center gap-3',
    iconTile: 'size-16 shrink-0 rounded-xl border border-[var(--t-rule)] bg-[var(--t-well)] grid place-items-center overflow-hidden',
    iconImg: 'size-full object-contain',
    iconEmpty: 't-metaXS text-[var(--t-pencil)]',
    iconActions: 'flex flex-wrap items-center gap-2',
    fileInput: 'hidden',

    // a colour: the native picker beside its hex value
    colorRow: 'flex items-center gap-2',
    swatch: 'size-9 shrink-0 cursor-pointer rounded-md border border-[var(--t-rule-strong)] bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0',

    footer: 'flex flex-wrap items-center gap-3',
    saved: 't-metaXS text-[var(--t-pencil)]',
    errorText: 't-metaSM text-[var(--t-brick)]',
    loading: 'px-4 py-6 t-metaSM text-[var(--t-pencil)]',
    iconSm: 'size-4',

    // the preview: a phone's address bar and browser tab, then the home-screen tile
    preview: 'flex flex-col gap-4',
    previewLabel: 't-metaXS text-[var(--t-pencil)]',
    browser: 'rounded-lg border border-[var(--t-rule)] overflow-hidden',
    browserBar: 'h-7 px-2 flex items-center gap-1.5 border-b border-[var(--t-rule)]',
    browserDot: 'size-2 rounded-full bg-black/20',
    browserTab: 'flex items-center gap-2 px-3 h-9 bg-[var(--t-panel)]',
    tabIcon: 'size-4 shrink-0 rounded-sm object-contain',
    tabIconEmpty: 'size-4 shrink-0 rounded-sm bg-[var(--t-rule)]',
    tabName: 'truncate text-[13px] leading-5 text-[var(--t-ink)]',
    home: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-well)] py-5 grid place-items-center',
    homeApp: 'flex flex-col items-center gap-1.5 w-20',
    homeTile: 'size-14 rounded-[22%] overflow-hidden grid place-items-center shadow-sm',
    homeImg: 'size-full object-contain',
    homeName: 'w-full truncate text-center text-[11px] leading-4 text-[var(--t-ink)]',
}
