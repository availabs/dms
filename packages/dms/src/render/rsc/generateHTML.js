// RSC spike, `ssr` environment: the RSC payload → streamed HTML for a document request
// (React Router's Data Mode RSC setup; rsc-view-pages.md, phase 2).
import React from 'react'
import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr'
import { renderToReadableStream } from 'react-dom/server.edge'
import {
  unstable_routeRSCServerRequest as routeRSCServerRequest,
  unstable_RSCStaticRouter as RSCStaticRouter,
} from 'react-router'
import { SlotHtmlContext } from './slotHtmlContext'

// slots: the page's section HTML (StaticSlot), which the payload of a document request leaves out
export async function generateHTML(request, serverResponse, { slots = null } = {}) {
  return await routeRSCServerRequest({
    request,
    serverResponse,
    createFromReadableStream,
    async renderHTML(getPayload, options) {
      const bootstrapScriptContent = await import.meta.viteRsc.loadBootstrapScriptContent('index')
      return await renderToReadableStream(
        React.createElement(SlotHtmlContext.Provider, { value: slots }, React.createElement(RSCStaticRouter, { getPayload })), {
        ...options,
        bootstrapScriptContent,
        signal: request.signal,
      })
    },
  })
}
