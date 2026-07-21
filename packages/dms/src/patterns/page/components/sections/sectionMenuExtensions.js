/**
 * Registry of theme/site-supplied additional item-groups for a section's
 * settings menu (sectionMenu.jsx), keyed by ComponentRegistry component
 * `name` (e.g. "AVL Graph"). Mirrors componentRegistry.js's shape/API so a
 * theme can extend a specific component type's menu (e.g. a domain-specific
 * "Measure" picker) without redefining or forking that component's whole
 * registry entry.
 *
 * Each registered builder is a plain function `(ctx) => itemGroup[]` — same
 * shape as the inline `join`/`comparisonSeries`/`pivot` item-groups already
 * built in getSectionMenuItems. See sectionMenu.jsx for the ctx shape passed
 * in and where the returned groups are spliced into the menu.
 */

const registry = {};

export function registerSectionMenuExtensions(componentName, builders) {
    if (!componentName) return;
    // Replace, not append — pagesConfig re-registers a theme's extensions on
    // every site-config build (HMR, multi-pattern loads, etc.); matching
    // registerComponents' Object.assign idempotency here avoids accumulating
    // duplicate builders across repeated calls with the same theme config.
    registry[componentName] = Array.isArray(builders) ? builders : [builders];
}

export function getSectionMenuExtensions(componentName) {
    return registry[componentName] || [];
}
