export const createSiteTheme = {
    wrapper: 'h-full w-full bg-slate-100 flex items-top justify-center',
    form: 'w-full h-fit max-h-fit p-4 flex flex-col justify-between gap-3',

    // InputComp sub-elements
    inputWrapper: 'w-full [&>[data-slot=label]+[data-slot=control]]:mt-3 [&>[data-slot=label]+[data-slot=description]]:mt-1 [&>[data-slot=description]+[data-slot=control]]:mt-3 [&>[data-slot=control]+[data-slot=description]]:mt-3 [&>[data-slot=control]+[data-slot=error]]:mt-3 [&>[data-slot=label]]:font-medium',
    inputLabel: 'select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/',
    inputControlSpan: 'relative block w-full before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow dark:before:hidden after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent sm:after:focus-within:ring-2 sm:after:focus-within:ring-blue-500 has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:bg-zinc-950/5 before:has-[[data-disabled]]:shadow-none before:has-[[data-invalid]]:shadow-red-500/10',
    input: 'relative shadow block w-full appearance-none rounded-lg px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing[3])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/ border border-zinc-950/10 data-[hover]:border-zinc-950/20 dark:border-white/10 dark:data-[hover]:border-white/20 bg-transparent dark:bg-white/5 focus:outline-none data-[invalid]:border-red-500 data-[invalid]:data-[hover]:border-red-500 data-[invalid]:dark:border-red-500 data-[invalid]:data-[hover]:dark:border-red-500 data-[disabled]:border-zinc-950/20 dark:data-[hover]:data-[disabled]:border-white/15 data-[disabled]:dark:border-white/15 data-[disabled]:dark:bg-white/[2.5%]',

    // Site template picker
    templateSection: 'mt-1',
    templateLabel: 'select-none text-base/6 text-zinc-950 font-medium block mb-2',
    templateGrid: 'grid grid-cols-2 gap-2',
    templateCard: 'border border-zinc-200 rounded-lg p-3 cursor-pointer select-none bg-white hover:border-zinc-400 transition-colors',
    templateCardSelected: 'border-2 border-zinc-800 rounded-lg p-3 cursor-pointer select-none bg-zinc-50',
    templateCardName: 'text-sm font-semibold text-zinc-800',
    templateCardDesc: 'text-xs text-zinc-400 mt-0.5 leading-snug',
}
