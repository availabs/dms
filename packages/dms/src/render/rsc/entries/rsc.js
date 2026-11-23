// RSC path, `rsc` environment entry (rsc-view-pages.md, phase 2). Named in the host app's RSC build config
// (dms-template vite.rsc.config.js); the Express mount (render/ssr2/express/setup.mjs) calls `configure`
// once, then the default export per request. The work is in ../rscHandler.js.
import { createRscHandler } from '../rscHandler.js'

let config = {}
export function configure(values) { config = values }

export default createRscHandler({
  loadSsr: () => import.meta.viteRsc.loadModule('ssr', 'index'),
  getConfig: () => config,
})
