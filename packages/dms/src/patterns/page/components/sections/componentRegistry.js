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
