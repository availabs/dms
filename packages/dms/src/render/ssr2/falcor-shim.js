// ESM shim for the 'falcor' CJS package.
// Vite 7's SSR module runner can't do named imports from CJS modules.
// This re-exports via the default import pattern that CJS interop supports.
//
// Import from 'falcor/lib/index.js' (not bare 'falcor') to avoid circular
// resolution — the vite.config.js alias redirects bare 'falcor' HERE.
import falcor from 'falcor/lib/index.js'
export const Model = falcor.Model
export default falcor
