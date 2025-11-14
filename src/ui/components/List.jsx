
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

  listboxOptions:'w-[var(--button-width)] z-20 bg-white rounded-xl border p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0',
  listboxOption: 'group flex gap-2 bg-white data-[focus]:bg-blue-100 z-30',
  listboxButton: 'relative block w-full rounded-lg bg-white/5 py-1.5 pr-8 pl-3 text-left text-sm/6 text-white focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25'
}

export function List({ className, valueMap = (d) => d, autoFocus, value, onChange, ...props }) {
  const listOptions =  value
    .map(valueMap)
    .map((opt,i) => {
    return (
      <div
        key={opt.value || opt }
        className={[
          // Basic layout
          `group/option grid cursor-default grid-cols-[theme(spacing.5),1fr] items-baseline gap-x-2 rounded-lg py-2.5 pl-2 pr-3.5
          sm:grid-cols-[theme(spacing.4),1fr] sm:py-1.5 sm:pl-1.5 sm:pr-3`,
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

        <span className={[className,  'col-start-1'].join(' ')}>{opt.label || opt}</span>
        <span className='col-start-3'>x</span>
      </div>
    )
  })
  //console.log('test options', options, value )
  return (
    <div className='relative'>
        {listOptions}
    </div>
  )
}

export default List


// let sharedClasses = [
//   // Base
//   'flex min-w-0 items-center',
//   // Icons
//   '[&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 sm:[&>[data-slot=icon]]:size-4',
//   '[&>[data-slot=icon]]:text-zinc-500 [&>[data-slot=icon]]:group-data-[focus]/option:text-white [&>[data-slot=icon]]:dark:text-zinc-400',
//   'forced-colors:[&>[data-slot=icon]]:text-[CanvasText] forced-colors:[&>[data-slot=icon]]:group-data-[focus]/option:text-[Canvas]',
//   // Avatars
//   '[&>[data-slot=avatar]]:-mx-0.5 [&>[data-slot=avatar]]:size-6 sm:[&>[data-slot=avatar]]:size-5'
// ].join(' ')
