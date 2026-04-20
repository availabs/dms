export const listboxTheme = {
  listboxContainer: [
    // Basic layout
    'group relative block w-full',
    // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
    'before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow',
    // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
    'dark:before:hidden',
    // Focus ring
    'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent after:has-[[data-focus]]:ring-2 after:has-[[data-focus]]:ring-blue-500',
    // Disabled state
    'has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:bg-zinc-950/5 before:has-[[data-disabled]]:shadow-none',
  ].join(' '),
  listboxOptions:'w-[var(--button-width)] z-20 bg-white rounded-xl border p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0',
  listboxOption: 'group flex gap-2 bg-white data-[focus]:bg-blue-100 z-30',
  listboxButton: 'relative block w-full rounded-lg bg-white/5 py-1.5 pr-8 pl-3 text-left text-sm/6 text-white focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25'
}
