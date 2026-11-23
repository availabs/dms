// RSC spike, `rsc` environment: the request handler (rsc-view-pages.md, phase 2, design §1).
// Serves three kinds of request:
//   - a document request for a page the RSC path can serve → the page as RSC, rendered to HTML by the
//     SSR environment (generateHTML). Any other document → a 404 carrying `x-dms-rsc: pass`, and the
//     Express mount (render/ssr2/express/setup.mjs) hands the request to today's SSR;
//   - `<path>.rsc` (the RSC router's navigation fetch) → the payload, or, for a page it can't serve, a
//     document redirect, so the browser loads that page the normal way (design §1: crossing between the
//     paths is a full page load);
//   - `<path>.manifest` and `/.manifest?paths=…` (the router's lazy route discovery) → answered by React Router.
// No server functions: decodeAction / decodeReply / loadServerAction are not passed (design §7).
import React from 'react'
import { createTemporaryReferenceSet, renderToReadableStream } from '@vitejs/plugin-rsc/rsc'
import { unstable_matchRSCServerRequest as matchRSCServerRequest, redirectDocument } from 'react-router'
import { ViewDocument } from './ViewDocument.jsx'

export const RSC_PASS_HEADER = 'x-dms-rsc'

// Pages the RSC path can't serve, remembered for a while. Deciding means running today's route tree once
// (loaders included), and a page that can't be served is then rendered again by today's SSR: measured,
// that doubled the server time of every page left on today's path (S6 on, 2026-11-21). Only "can't
// serve" is remembered: a stale entry sends a page that became servable down today's path, which is
// always correct; a stale "can serve" would not be. A signed-in visitor's render is their own (what they may
// read decides what can be served), so their entries are keyed by user as well as URL.
const INELIGIBLE_TTL_MS = 5 * 60 * 1000
const INELIGIBLE_MAX = 5000
const ineligible = new Map()

function ineligibleKey(docUrl, session) {
  const u = new URL(docUrl)
  u.searchParams.delete('_routes')
  return `${session?.user ? `${session.user.id ?? session.user.email}|` : ''}${u.host}${u.pathname}?${u.searchParams.toString()}`
}

function recallIneligible(key) {
  const hit = ineligible.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > INELIGIBLE_TTL_MS) {
    ineligible.delete(key)
    return null
  }
  return hit.page
}

function rememberIneligible(key, page) {
  if (ineligible.size >= INELIGIBLE_MAX) ineligible.delete(ineligible.keys().next().value)
  ineligible.set(key, { at: Date.now(), page: { eligible: false, status: page.status, reason: page.reason, redirect: page.redirect } })
}

function documentRequest(request) {
  const url = new URL(request.url)
  if (url.pathname.endsWith('/_.rsc')) url.pathname = url.pathname.replace(/_\.rsc$/, '')
  else if (url.pathname.endsWith('.rsc')) url.pathname = url.pathname.replace(/\.rsc$/, '')
  return new Request(url, { headers: request.headers })
}

/**
 * @param {object} o
 * @param {() => Promise<{ resolveRscPage, generateHTML }>} o.loadSsr - the SSR environment's entry
 * @param {() => object} o.getConfig - { handlerConfig, templateHead }, set by the Express mount
 */
export function createRscHandler({ loadSsr, getConfig }) {
  // session: { state, user, token } from the page host's session cookie (the Express mount), or null.
  // The page renders as its user; the mount marks a signed-in response private.
  // siteCss: { href, partial, fallbackHtml } | null, the site's server-compiled sheet for the document head.
  return async function handler(request, { session = null, siteCss = null } = {}) {
    const url = new URL(request.url)
    const isManifest = url.pathname.endsWith('.manifest')
    const isRsc = url.pathname.endsWith('.rsc')
    const ssr = await loadSsr()

    let page = null
    if (!isManifest) {
      const doc = documentRequest(request)
      const key = ineligibleKey(doc.url, session)
      page = recallIneligible(key)
      if (!page) {
        page = await ssr.resolveRscPage(doc, { ...getConfig(), session, siteCss })
        if (!page.eligible) rememberIneligible(key, page)
      } else {
        page = { ...page }
      }
      if (!page.eligible && !isRsc) {
        return new Response(null, { status: 404, headers: { [RSC_PASS_HEADER]: 'pass', 'x-dms-rsc-reason': encodeURIComponent(page.reason || page.redirect || '') } })
      }
      // a navigation's payload carries the section HTML; a document's leaves it to the HTML stream (StaticSlot)
      page.inlineSlots = isRsc
      if (!page.eligible) page.documentUrl = page.redirect || (new URL(doc.url).pathname + url.search)
    }

    const route = { id: 'dms', path: '*' }
    if (page?.eligible) route.Component = function DmsRscPage() { return React.createElement(ViewDocument, { page }) }
    else {
      route.Component = function DmsRscRedirect() { return null }
      if (page) route.loader = () => { throw redirectDocument(page.documentUrl) }
    }

    const rscResponse = await matchRSCServerRequest({
      createTemporaryReferenceSet,
      request,
      routes: [route],
      generateResponse(match, options) {
        return new Response(renderToReadableStream(match.payload, options), {
          status: page?.eligible ? page.status : match.statusCode,
          headers: match.headers,
        })
      },
    })
    if (isRsc || isManifest) return rscResponse
    const html = await ssr.generateHTML(request, rscResponse, { slots: page?.slots })
    // how many sections stay live in the browser (section islands): for the coverage census and debugging
    const islands = page?.island?.sectionIslands?.sections?.length
    if (islands) html.headers.set('x-dms-rsc-islands', String(islands))
    return html
  }
}
