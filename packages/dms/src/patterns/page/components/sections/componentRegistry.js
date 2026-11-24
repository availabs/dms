import ComponentRegistry from './components/ComponentRegistry'
import { registered as registeredComponents, registerComponent, registerComponents } from './componentRegistryStore'

// The built-in section types join whatever is registered already (a plugin can register before this module
// loads); a registered type of the same name wins, as it does when it registers afterwards.
for (const [name, definition] of Object.entries(ComponentRegistry)) {
    if (!(name in registeredComponents)) registeredComponents[name] = definition
}

export { registerComponent, registerComponents }

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
