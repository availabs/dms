// The section types registered so far, by name: the one object the section registry is (componentRegistry.js
// adds the built-in types to it when it loads). Kept apart from the built-ins so code that only REGISTERS
// types (the plugin host, the pattern-type registry) doesn't import every built-in section component:
// the islands browser entry loads those two, and a page of static HTML needs no section code at all
// (static-html-islands.md, priority C). Read the registry through componentRegistry.js, never from here.
export const registered = {}

export function registerComponent(name, definition) {
    registered[name] = definition
}

export function registerComponents(comps = {}) {
    Object.assign(registered, comps)
}
