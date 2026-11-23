import React from 'react'

/**
 * The RSC spike's server pass (rsc-view-pages.md, phase 2). `render/rsc/resolvePage.jsx` renders today's
 * route tree on the server with this context set to an empty object. A route component that has opted in
 * (its config carries `serverComponent`) and can be served with no JavaScript fills the object with what
 * the client island needs and renders its content with no client chrome around it. Outside that pass the
 * value is null and nothing changes.
 *
 * Filled by the page view (patterns/page/pages/view.jsx):
 *   capture.kind       'page-view'
 *   capture.eligible   true, or capture.reason (why it falls back to today's path)
 *   capture.island     serializable props for the client island (nav items, theme inputs, CMS fields)
 */
export const RscCaptureContext = React.createContext(null)
