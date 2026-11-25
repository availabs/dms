// How fresh the server render's shared page data is (ssr-logged-in-render-and-stale-cache.md, issue 3).
//
// On the server each host's routes are built once, and each pattern route keeps one data model that every
// anonymous request reads through (render/dmsPageFactory.jsx, utils/requestScope.js). Without this, a page
// read once was served from that model until the process restarted, so an edit or a publish never reached
// signed-out visitors of a server-rendered site.
//
// An app's version changes when one of its rows is written (dms-server passes every change notice to the
// handler's `noteChange`), and also every `maxAgeMs` for writes this server never hears about: another process
// writing the same database, or an external (DAMA) dataset. A page loader that finds the version moved empties
// its shared model first (dmsPageFactory). A write to a row the routes are built from (site, pattern, theme,
// dmsenv) also drops the cached routes: `noteChange` says so.

// the row kinds the route tree is built from: `prod:site`, `prod|docs:pattern` (and the admin's bare `pattern`),
// `catalyst:theme`, `prod|env:dmsenv`
const ROUTE_KINDS = /(^|[:|])(site|pattern|theme|dmsenv)$/

/** Whether a write to a row of this type changes the routes themselves, not only the data they read. */
export const routeAffecting = (type) => ROUTE_KINDS.test(String(type || ''))

/**
 * @param {object} [options]
 * @param {number} [options.maxAgeMs] - the longest a shared model keeps data without a change notice (0: no limit)
 * @param {() => number} [options.now]
 * @returns {{ versionOf(app: string): string, noteChange(app: string, type?: string): boolean }}
 *   `noteChange` returns true when the routes must be rebuilt too
 */
export function createDataVersions({ maxAgeMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const counts = new Map()   // app -> number of changes seen
  return {
    versionOf(app) {
      return `${counts.get(app) || 0}:${maxAgeMs > 0 ? Math.floor(now() / maxAgeMs) : 0}`
    },
    noteChange(app, type) {
      counts.set(app, (counts.get(app) || 0) + 1)
      return routeAffecting(type)
    },
  }
}
