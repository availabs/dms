// Ported to tessera's var(--t-*) tokens (2026-09-17) — used by both the
// "New Site" page (/create) and TenantList's "Add tenant" modal (via
// SiteTemplatePicker), both of which render under AdminLayout's hardcoded
// "default" theme, so a plain zinc/white palette (plus catalyst-style
// `dark:`-variant classes that never applied — this app's dark mode is
// driven by a `[data-theme="dark"]` attribute selector, not `.dark` or
// `prefers-color-scheme`) stayed light in dark mode regardless of the page
// around it.
export const createSiteTheme = {
    wrapper: 'h-full w-full bg-[var(--t-paper)] flex items-top justify-center',
    form: 'w-full h-fit max-h-fit p-4 flex flex-col justify-between gap-3',

    // InputComp sub-elements
    inputWrapper: 'w-full [&>[data-slot=label]+[data-slot=control]]:mt-3 [&>[data-slot=label]+[data-slot=description]]:mt-1 [&>[data-slot=description]+[data-slot=control]]:mt-3 [&>[data-slot=control]+[data-slot=description]]:mt-3 [&>[data-slot=control]+[data-slot=error]]:mt-3 [&>[data-slot=label]]:font-medium',
    inputLabel: 'select-none text-base/6 text-[var(--t-ink)] data-[disabled]:opacity-50 sm:text-sm/',
    inputControlSpan: 'relative block w-full before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-[var(--t-panel)] before:shadow after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent sm:after:focus-within:ring-2 sm:after:focus-within:ring-[var(--t-cobalt)] has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:shadow-none before:has-[[data-invalid]]:shadow-[var(--t-brick)]/10',
    input: 'relative shadow block w-full appearance-none rounded-lg px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing[3])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] text-base/6 text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] sm:text-sm/ border border-[var(--t-rule-strong)] data-[hover]:border-[var(--t-graphite)] bg-transparent focus:outline-none data-[invalid]:border-[var(--t-brick)] data-[invalid]:data-[hover]:border-[var(--t-brick)] data-[disabled]:border-[var(--t-rule)]',

    // Site template picker (also used by TenantList's "Add tenant" modal)
    templateSection: 'mt-1',
    templateLabel: 'select-none text-base/6 text-[var(--t-ink)] font-medium block mb-2',
    templateGrid: 'grid grid-cols-2 gap-2',
    templateCard: 'border border-[var(--t-rule)] rounded-lg p-3 cursor-pointer select-none bg-[var(--t-well)] hover:border-[var(--t-rule-strong)] hover:bg-[var(--t-panel)] transition-colors',
    templateCardSelected: 'border-2 border-[var(--t-cobalt)] rounded-lg p-3 cursor-pointer select-none bg-[var(--t-panel)] ring-2 ring-[var(--t-cobalt-soft)]',
    templateCardName: 'text-sm font-semibold text-[var(--t-ink)]',
    templateCardDesc: 'text-xs text-[var(--t-pencil)] mt-0.5 leading-snug',
}
