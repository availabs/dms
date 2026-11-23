// RSC path (rsc-view-pages.md, phase 2): mounts a server-rendered page's section islands, the sections
// that stay live in the browser (render/rsc/resolvePage.js islandsOf). Rendered inside ClientChrome, so the
// islands sit under its theme, auth and CMS providers; renders nothing on the server and during
// hydration, then loads the island code (the page pattern's section view and everything a section can
// need, one lazy chunk, plus the app's pattern types: clientConfig `loadPatternTypes`) and hands over to SectionIslands, which takes each section's server HTML over.
// ClientChrome keys it by the page's URL: a navigation replaces the slot HTML, and with it the elements
// the islands mount into.
import React from 'react'
import { getRscClientConfig } from './clientConfig.js'

// the island code, and the app's pattern types (their section types), before any island renders
const SectionIslands = React.lazy(() => Promise.all([
  import('./SectionIslands.jsx'),
  getRscClientConfig().loadPatternTypes?.(),
]).then(([m]) => m))

export default function IslandHost({ islands }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return (
    <React.Suspense fallback={null}>
      <SectionIslands islands={islands} />
    </React.Suspense>
  )
}
