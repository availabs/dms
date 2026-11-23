// RSC spike, `rsc` environment (rsc-view-pages.md, phase 2): the document for a page served by the RSC
// path. A server component: no hooks, no context, nothing that calls createContext at import (react-server
// has none). The page's content arrives as HTML from the SSR environment (resolvePage.js) and is placed as
// static markup (StaticSlot): the browser gets no code for it and no copy of its data. A document request
// leaves the HTML out of the payload (page.inlineSlots false; generateHTML supplies it to the SSR render).
// The chrome is the one client component (ClientChrome, a client reference).
import React from 'react'
import ClientChrome from './ClientChrome.jsx'
import StaticSlot from './StaticSlot.jsx'

const ATTR_NAMES = { class: 'className', charset: 'charSet', crossorigin: 'crossOrigin', 'http-equiv': 'httpEquiv' }

function HeadTag({ tag, attrs, text }) {
  const props = {}
  for (const [k, v] of Object.entries(attrs || {})) props[ATTR_NAMES[k] || k] = v
  if ('defer' in props) props.defer = true
  if ('async' in props) props.async = true
  if ((tag === 'style' || tag === 'script') && text) props.dangerouslySetInnerHTML = { __html: text }
  if (tag === 'title') return <title>{text}</title>
  return React.createElement(tag, props)
}

export function ViewDocument({ page }) {
  return (
    <html lang="en">
      <head>
        {page.head.map((t, i) => <HeadTag key={i} {...t} />)}
      </head>
      <body>
        <div id="root">
          <ClientChrome island={page.island}
            top={<StaticSlot name="top" html={page.inlineSlots ? page.slots.top : null} />}
            content={<StaticSlot name="content" html={page.inlineSlots ? page.slots.content : null} />}
            bottom={<StaticSlot name="bottom" html={page.inlineSlots ? page.slots.bottom : null} />} />
        </div>
      </body>
    </html>
  )
}
