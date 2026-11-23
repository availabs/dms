'use client'
// RSC spike (rsc-view-pages.md, phase 2): one section-group slot of server-rendered HTML.
//   - a client navigation (`.rsc`): the HTML arrives in the payload, as `html`;
//   - a document request: `html` is null and the payload stays small. The SSR render takes the HTML from
//     SlotHtmlContext (generateHTML), and hydration reuses what is already in the page, read back from the
//     DOM once, so React sees the same markup and never writes it again.
// display: contents keeps the wrapper out of the layout, so the theme's classes apply as in today's render,
// where the section groups are the Layout's direct children.
import React from 'react'
import { SlotHtmlContext } from './slotHtmlContext'

export default function StaticSlot({ name, html }) {
  const ssrSlots = React.useContext(SlotHtmlContext)
  const [fromPage] = React.useState(() => {
    if (html != null) return html
    if (ssrSlots) return ssrSlots[name] ?? ''
    return typeof document === 'undefined' ? '' : (document.querySelector(`[data-dms-slot="${name}"]`)?.innerHTML ?? '')
  })
  return <div data-dms-slot={name} style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html ?? fromPage }} />
}
