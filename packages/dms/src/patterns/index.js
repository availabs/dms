import pageConfig from './page/siteConfig'
import adminConfig from './admin/siteConfig'
import authConfig from './auth/siteConfig'

// Eagerly start loading optional patterns at module evaluation time.
// By the time site data arrives from the API and we call resolvePatterns(),
// these are likely already resolved.
const lazyPatterns = {
  datasets: import('./datasets/siteConfig'),
  forms: import('./forms/siteConfig'),
  mapeditor: import('./mapeditor/siteConfig'),
}

const eagerPatterns = {
  page: pageConfig,
  admin: adminConfig,
  auth: authConfig,
}

let _resolved = null

// Resolve all pattern configs. The dynamic imports were kicked off at module
// load time, so this typically resolves instantly from cache.
export async function resolvePatterns() {
  if (_resolved) return _resolved
  const entries = await Promise.all(
    Object.entries(lazyPatterns).map(async ([key, promise]) => [key, (await promise).default])
  )
  _resolved = { ...eagerPatterns, ...Object.fromEntries(entries) }
  return _resolved
}

// Default export provides the always-available patterns (admin, page, auth).
// Lazy patterns are only available after resolvePatterns() completes.
export default eagerPatterns
