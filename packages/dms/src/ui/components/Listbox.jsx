
import React, { Fragment } from 'react'
import * as Headless from '@headlessui/react'
// import { CMSContext } from '../../../siteConfig';
/*  ---------------------------------------------------------
 Use Example: 
  <ListBox 
    options={[
      {
        label: 'Annotation Card',
        value: 'Annotation'
      },
      {
        label: 'HandWritten Card',
        value: 'Handwritten'
      },
    ]}
    value={myState}
    onChange={e => setMyState(e.target.value)}
  />

 --------------------------------------------------------- */

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

export function Listbox({ className, placeholder, autoFocus, 'aria-label': ariaLabel, options, value, onChange, ...props }) {
  const listOptions =  options.map((opt,i) => {
    return (
      <ListboxOption 
        key={opt.value} 
        value={opt.value}
      >
        {opt.label}
      </ListboxOption>
    )
  })
  //console.log('test options', options, value )
  return (
    <div className='relative'>
    <Headless.Listbox multiple={false} value={value} onChange={onChange}>
      <Headless.ListboxButton
        autoFocus={autoFocus}
        data-slot="control"
        aria-label={ariaLabel}
        className={[
          className,
          // Basic layout
          'group relative block w-full',
          // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
          'before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow',
          // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
          'dark:before:hidden',
          // Hide default focus styles
          'focus:outline-none',
          // Focus ring
          'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent after:data-[focus]:ring-2 after:data-[focus]:ring-blue-500',
          // Disabled state
          'data-[disabled]:opacity-50 before:data-[disabled]:bg-zinc-950/5 before:data-[disabled]:shadow-none',
        ].join(' ')}
      >
        <Headless.ListboxSelectedOption
          as="span"
          options={listOptions}
          placeholder={placeholder && <span className="block truncate text-zinc-500">{placeholder}</span>}
          className={[
            // Basic layout
            'relative block w-full appearance-none rounded-lg py-[calc(theme(spacing[2.5])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]',
            // Set minimum height for when no value is selected
            'min-h-11 sm:min-h-9',
            // Horizontal padding
            'pl-[calc(theme(spacing[3.5])-1px)] pr-[calc(theme(spacing.7)-1px)] sm:pl-[calc(theme(spacing.3)-1px)]',
            // Typography
            'text-left text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
            // Border
            'border border-zinc-950/10 group-data-[active]:border-zinc-950/20 group-data-[hover]:border-zinc-950/20 dark:border-white/10 dark:group-data-[active]:border-white/20 dark:group-data-[hover]:border-white/20',
            // Background color
            'bg-transparent dark:bg-white/5',
            // Invalid state
            'group-data-[invalid]:border-red-500 group-data-[invalid]:group-data-[hover]:border-red-500 group-data-[invalid]:dark:border-red-600 group-data-[invalid]:data-[hover]:dark:border-red-600',
            // Disabled state
            'group-data-[disabled]:border-zinc-950/20 group-data-[disabled]:opacity-100 group-data-[disabled]:dark:border-white/15 group-data-[disabled]:dark:bg-white/[2.5%] dark:data-[hover]:group-data-[disabled]:border-white/15',
          ].join(' ')}
        />
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            className="size-5 stroke-zinc-500 group-data-[disabled]:stroke-zinc-600 sm:size-4 dark:stroke-zinc-400 forced-colors:stroke-[CanvasText]"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Headless.ListboxButton>
      <Headless.ListboxOptions
        transition
        anchor="selection start"
        className={[
          // Anchor positioning
          'z-50 [--anchor-offset:-1.625rem] [--anchor-padding:theme(spacing.4)] sm:[--anchor-offset:-1.375rem]',
          // Base styles
          'isolate w-max min-w-[calc(var(--button-width)+1.75rem)] select-none scroll-py-1 rounded-xl p-1',
          // Invisible border that is only visible in `forced-colors` mode for accessibility purposes
          'outline outline-1 outline-transparent focus:outline-none',
          // Handle scrolling when menu won't fit in viewport
          'overflow-y-scroll overscroll-contain',
          // Popover background
          'bg-white/75 backdrop-blur-xl dark:bg-zinc-800/75',
          // Shadows
          'shadow-lg ring-1 ring-zinc-950/10 dark:ring-inset dark:ring-white/10',
          // Transitions
          'transition-opacity duration-100 ease-in data-[transition]:pointer-events-none data-[closed]:data-[leave]:opacity-0'
        ].join(' ')}
      >
        {listOptions}
      </Headless.ListboxOptions>
    </Headless.Listbox>
    </div>
  )
}

export default Listbox

function ListboxOption({ children, className, ...props }) {
  let sharedClasses = [
    // Base
    'flex min-w-0 items-center',
    // Icons
    '[&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 sm:[&>[data-slot=icon]]:size-4',
    '[&>[data-slot=icon]]:text-zinc-500 [&>[data-slot=icon]]:group-data-[focus]/option:text-white [&>[data-slot=icon]]:dark:text-zinc-400',
    'forced-colors:[&>[data-slot=icon]]:text-[CanvasText] forced-colors:[&>[data-slot=icon]]:group-data-[focus]/option:text-[Canvas]',
    // Avatars
    '[&>[data-slot=avatar]]:-mx-0.5 [&>[data-slot=avatar]]:size-6 sm:[&>[data-slot=avatar]]:size-5'
  ].join(' ')

  return (
    <Headless.ListboxOption as={Fragment} {...props}>
      {({ selectedOption }) => {
        if (selectedOption) {
          return <div className={[className, sharedClasses].join(' ')}>{children}</div>
        }

        return (
          <div
            className={[
              // Basic layout
              'group/option grid cursor-default grid-cols-[theme(spacing.5),1fr] items-baseline gap-x-2 rounded-lg py-2.5 pl-2 pr-3.5 sm:grid-cols-[theme(spacing.4),1fr] sm:py-1.5 sm:pl-1.5 sm:pr-3',
              // Typography
              'text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText]',
              // Focus
              'outline-none data-[focus]:bg-blue-500 data-[focus]:text-white',
              // Forced colors mode
              'forced-color-adjust-none forced-colors:data-[focus]:bg-[Highlight] forced-colors:data-[focus]:text-[HighlightText]',
              // Disabled
              'data-[disabled]:opacity-50'
            ].join(' ')}
          >
            <svg
              className="relative hidden size-5 self-center stroke-current group-data-[selected]/option:inline sm:size-4"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path d="M4 8.5l3 3L12 4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={[className, sharedClasses, 'col-start-2'].join(' ')}>{children}</span>
          </div>
        )
      }}
    </Headless.ListboxOption>
  )
}

