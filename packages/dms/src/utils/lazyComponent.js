import React from 'react'

/**
 * SSR-safe code splitting for components.
 *
 * `lazyComponent(id, () => import('./Foo'))` returns a component that renders
 * `Foo` once its chunk has loaded, so `Foo` (and everything only it imports)
 * leaves the eagerly-loaded bundle. Plain `React.lazy` isn't enough here:
 * `renderToString` (render/ssr2) emits a Suspense boundary's fallback instead
 * of waiting, so server HTML would lose the content, and the client's first
 * render wouldn't match it. This wrapper closes both gaps:
 *
 *  - Once loaded, it resolves SYNCHRONOUSLY. The React.lazy factory hands back
 *    an already-settled thenable, and React's lazy initializer then marks the
 *    component resolved before it checks — it never suspends.
 *  - The SSR server awaits `preloadAllLazyComponents()` before rendering, so
 *    server HTML is exactly what it was before the split.
 *  - `collectRenderedLazyComponents()` records which ids rendered during a
 *    (synchronous) `renderToString`; the server ships that list to the client
 *    (`__dmsSSRData.lazy`), which awaits `preloadLazyComponents(list)` before
 *    `hydrateRoot` — so hydration renders synchronously and matches.
 *  - SPA: a Suspense boundary inside the wrapper shows `fallback` until the
 *    chunk lands. Callers that know what a page will need ahead of time (the
 *    page loader knows its section types) can call `Comp.preload()` to fetch
 *    the chunk in parallel with data instead of after it.
 *
 * `id` must be unique and identical in the client and server builds (it's
 * what the hydration list names). See
 * planning/tasks/completed/bundle-split-initial-graph.md.
 */

const registry = new Map()   // id -> preload()
let collector = null         // Set of ids rendered during the current SSR render

// A chunk-load failure in production is almost always a stale asset
// reference: this tab's index.html predates a deploy that no longer serves
// that chunk hash. Reload once per id per tab session to pick up the new
// build; the sessionStorage guard stops a genuinely broken/offline load from
// looping. Same recovery the lazy theme loader (src/themes/index.js) uses.
function tryRecoverFromLoadFailure(id) {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined' || !window.location?.reload) return false
    const key = `dms-chunk-reload-${id}`
    try {
        if (sessionStorage.getItem(key)) return false
        sessionStorage.setItem(key, '1')
    } catch {
        return false
    }
    window.location.reload()
    return true
}

export function lazyComponent(id, load, { fallback = null } = {}) {
    let Loaded = null
    let inflight = null

    const preload = () => {
        if (Loaded) return Promise.resolve(Loaded)
        if (!inflight) {
            inflight = load()
                .then(mod => {
                    Loaded = mod?.default ?? mod
                    return Loaded
                })
                .catch(err => {
                    inflight = null
                    console.error(`[dms] failed to load component "${id}":`, err)
                    if (tryRecoverFromLoadFailure(id)) return new Promise(() => {}) // reloading
                    throw err
                })
        }
        return inflight
    }

    const Lazy = React.lazy(() => Loaded
        // Already loaded: a thenable that settles synchronously, so React
        // resolves the lazy in place instead of suspending (see header).
        ? { then: (resolve) => resolve({ default: Loaded }) }
        : preload().then(C => ({ default: C })))

    function LazyComponent(props) {
        collector?.add(id)
        return React.createElement(React.Suspense, { fallback }, React.createElement(Lazy, props))
    }
    LazyComponent.displayName = `Lazy(${id})`
    LazyComponent.preload = preload

    registry.set(id, preload)
    return LazyComponent
}

/**
 * Load every registered lazy component. The SSR server calls this before each
 * render (cheap after the first: each preload is memoized). Loops because a
 * lazily-loaded module can itself register more lazy components.
 */
export async function preloadAllLazyComponents() {
    const started = new Set()
    for (;;) {
        const next = [...registry.keys()].filter(id => !started.has(id))
        if (!next.length) return
        next.forEach(id => started.add(id))
        const results = await Promise.allSettled(next.map(id => registry.get(id)()))
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[dms] SSR preload failed for "${next[i]}":`, r.reason)
        })
    }
}

/**
 * Load the named lazy components (the list the server rendered — see
 * `collectRenderedLazyComponents`). Ids registered only inside another lazy
 * module become known once that module loads, hence the loop.
 */
export async function preloadLazyComponents(ids) {
    const wanted = new Set(ids || [])
    const started = new Set()
    for (;;) {
        const next = [...wanted].filter(id => !started.has(id) && registry.has(id))
        if (!next.length) return
        next.forEach(id => started.add(id))
        await Promise.allSettled(next.map(id => registry.get(id)()))
    }
}

/**
 * Run a synchronous render (renderToString) and report which lazy components
 * it rendered: returns `[result, ids]`.
 */
export function collectRenderedLazyComponents(render) {
    const prev = collector
    collector = new Set()
    try {
        const result = render()
        return [result, [...collector]]
    } finally {
        collector = prev
    }
}
