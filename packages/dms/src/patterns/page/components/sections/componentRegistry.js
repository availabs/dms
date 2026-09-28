import ComponentRegistry from './components/ComponentRegistry'

const registeredComponents = { ...ComponentRegistry }

export function registerComponent(name, definition) {
    registeredComponents[name] = definition
}

export function registerComponents(comps = {}) {
    Object.assign(registeredComponents, comps)
}

export function getRegisteredComponents() {
    return registeredComponents
}

/**
 * Start loading the code-split parts of the given section element-types — a
 * registry entry's optional `preload()` (e.g. Map's MapSection, Graph's
 * graph_new) — so the page loader can fetch a page's lazy section chunks
 * alongside its data instead of after the first render. Never rejects.
 * See planning/tasks/completed/bundle-split-initial-graph.md.
 */
export function preloadSectionComponents(elementTypes = []) {
    const loads = [...new Set(elementTypes)]
        .map(type => registeredComponents[type]?.preload?.())
        .filter(Boolean)
    return Promise.allSettled(loads)
}
