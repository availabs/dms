// RSC path, browser entry (rsc-view-pages.md, phase 2): the only code a page served by the RSC path loads
// is this, the RSC router, the client chrome (../ClientChrome.jsx) and the theme. The `@dms-host/*` modules
// are the host app's, named by aliases in its RSC build config (see ./README.md).
//
// Every nav widget the server registers must be registered by `@dms-host/widgets` too, or the Layout draws
// its empty placeholder where the server drew the widget, and hydration fails.
import loadThemes from '@dms-host/themes'
import '@dms-host/widgets'
import { API_HOST } from '@dms-host/api-host'
import { configureRscClient } from '../clientConfig.js'
import { hydrateRsc } from '../hydrate.js'

configureRscClient({
  loadThemes, API_HOST, AUTH_HOST: API_HOST, isMultiTenant: import.meta.env.VITE_DMS_MULTI_TENANT === '1',
  // the host's plugins, for the section types they ship: loaded only by a page with section islands
  loadPatternTypes: () => import('@dms-host/plugins'),
})
hydrateRsc()
