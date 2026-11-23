// RSC path, `ssr` environment entry (rsc-view-pages.md, phase 2): HTML from the RSC payload, and the page
// resolver, which renders today's route tree with the host app's own SSR handler (its themes, plugins and
// widgets). The `@dms-host/*` modules are the host app's, named by aliases in its RSC build config
// (see ./README.md).
import createHandler from '@dms-host/ssr-handler'
import loadThemes from '@dms-host/themes'
import { API_HOST } from '@dms-host/api-host'
import { createRscPageResolver } from '../resolvePage.js'
import { configureRscClient } from '../clientConfig.js'

export { generateHTML } from '../generateHTML.js'

// the client chrome also renders here (to HTML); it fetches nothing on the server
configureRscClient({ loadThemes, API_HOST, AUTH_HOST: API_HOST })

export const resolveRscPage = createRscPageResolver(createHandler)
