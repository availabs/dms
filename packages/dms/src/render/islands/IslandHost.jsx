// Islands path (static-html-islands.md): mounts a server-rendered page's section islands, the sections
// that run in the browser (./islandData.js sectionIslandsOf). Rendered inside ClientChrome, so the islands sit
// under its theme, auth and CMS providers; renders nothing on the server and during hydration.
//
// An island either mounts as soon as the page has hydrated, or (`wake`: its registry entry says `wakeOnUse`)
// keeps its server HTML until the reader uses it: points at it, focuses something in it, touches it, or
// changes the page's state (SectionIslands). The island code (./islandCode.js: the page pattern's section
// view and everything a section can need, one lazy chunk) and the plugins the page's sections need
// (`islands.plugins`, named by the server) load when the first island has to mount, so a page whose islands
// all wait loads neither until the reader uses one.
// ClientChrome keys this component by the page's URL: a navigation replaces the slot HTML, and with it the
// elements the islands mount into.
import React from 'react'
import { getIslandsClientConfig } from './clientConfig.js'

const loadIslandCode = () => import('./islandCode.js')

// what the reader does to a section before anything in it can respond: point at it, focus into it, touch it
const WAKE_EVENTS = ['pointerover', 'focusin', 'touchstart']

// A plugin is loaded once: one compiled into the app by its loader (clientConfig `pluginLoaders`), one
// installed at run time from the API host. A plugin that fails to load leaves its section's server HTML in
// place (SectionIslands does not mount a type nothing registered).
const pluginLoads = new Map()   // plugin name -> promise
function loadPlugins(list = []) {
  const { pluginLoaders, API_HOST } = getIslandsClientConfig()
  return Promise.all(list.map(({ name, version }) => {
    if (!pluginLoads.has(name)) {
      const compiledIn = pluginLoaders?.[name]
      // the plugin's own code downloads beside the island code; the plugin host comes with the island code
      pluginLoads.set(name, Promise.all([loadIslandCode(), compiledIn?.()]).then(([host, entry]) =>
        (entry ? host.registerPlugin(entry.default) : host.loadPlugins([{ name, version, url: host.clientPluginUrl(API_HOST, name, version) }])),
      ).catch((e) => console.error(`[islands] plugin ${name} did not load`, e)))
    }
    return pluginLoads.get(name)
  }))
}

export default function IslandHost({ islands }) {
  // null until mounted (nothing renders during hydration), then the keys of the waiting sections now in use
  const [awake, setAwake] = React.useState(null)
  // the island code, once it, the page's plugins and its live sections' lazy chunks are all here
  const [code, setCode] = React.useState(null)

  React.useEffect(() => {
    setAwake(new Set())
    const stop = []
    for (const { key, wake } of islands.sections) {
      const el = wake ? document.querySelector(`[data-dms-island="${key}"]`) : null
      if (!el) continue
      const off = () => WAKE_EVENTS.forEach((type) => el.removeEventListener(type, onUse))
      const onUse = () => {
        off()
        // already live: the page's state changed first (SectionIslands)
        if (el.dataset.dmsIslandLive !== undefined) return
        // until the live section has taken over (SectionIslands clears it)
        el.style.cursor = 'progress'
        setAwake((prev) => new Set(prev).add(key))
      }
      WAKE_EVENTS.forEach((type) => el.addEventListener(type, onUse, { passive: true }))
      stop.push(off)
    }
    return () => stop.forEach((off) => off())
  }, [])

  const needed = awake !== null && (awake.size > 0 || islands.sections.some((s) => !s.wake))
  React.useEffect(() => {
    if (!needed) return
    let current = true
    // Nothing below may suspend on its first render. A section that waited for a lazy chunk (a Graph's chart
    // code) showed its boundary's empty fallback first, and React holds the content back for 300 ms after a
    // fallback, even when the chunk arrives in 5 ms: every page with a live Graph mounted its sections 0.3 s
    // late (FUSION, 2026-11-25). So the section types' chunks are fetched here, with the rest, and
    // SectionIslands is rendered from the loaded module, not through React.lazy.
    const types = islands.sections.map((s) => islands.page?.item?.sections?.[s.index]?.element?.['element-type']).filter(Boolean)
    Promise.all([loadIslandCode(), loadPlugins(islands.plugins)])
      .then(([loaded]) => loaded.preloadSectionComponents(types).then(() => loaded))
      .then((loaded) => { if (current) setCode(loaded) })
    return () => { current = false }
  }, [needed])

  if (!code) return null
  return (
    <React.Suspense fallback={null}>
      <code.SectionIslands islands={islands} awake={awake} />
    </React.Suspense>
  )
}
