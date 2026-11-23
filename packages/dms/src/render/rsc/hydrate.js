// RSC spike, browser: hydrate the document with React Router's RSC router (rsc-view-pages.md, phase 2).
// No server functions, so no setServerCallback (design §7).
import React, { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createFromReadableStream } from '@vitejs/plugin-rsc/browser'
import {
  unstable_getRSCStream as getRSCStream,
  unstable_RSCHydratedRouter as RSCHydratedRouter,
} from 'react-router/dom'

export function hydrateRsc() {
  // An RSC page: the session cookie is kept in step from here too (patterns/auth/api.js syncSessionCookie).
  // The page says who it was rendered for in its chrome's props (island.session: the user, or 'anonymous'
  // for the document every visitor who isn't signed in shares); providers.jsx reads it.
  window.__dmsRscPage = true
  createFromReadableStream(getRSCStream()).then((payload) => {
    startTransition(() => {
      hydrateRoot(
        document,
        React.createElement(StrictMode, null,
          React.createElement(RSCHydratedRouter, { createFromReadableStream, payload })),
      )
    })
  })
}
