/**
 * Registry of theme/site-supplied inline content for a section's header band
 * (the row showing the title and the "⋮" Settings-menu trigger), keyed by
 * ComponentRegistry component `name` (e.g. "AVL Graph"). Mirrors
 * sectionMenuExtensions.js's shape/API — a theme can inject content directly
 * into the header (e.g. Quick Controls pills) instead of only being able to
 * add item-groups to the Settings drawer.
 *
 * Each registered builder is a plain function `(ctx) => ReactNode | ReactNode[] | null`.
 * ctx is the same shape sectionMenu extensions already receive — see
 * section.jsx's `headerExtensions` computation and sectionMenu.jsx's
 * `extensionMenus` for where the ctx is assembled and the returned nodes
 * are rendered.
 */

const registry = {};

export function registerSectionHeaderExtensions(componentName, builders) {
    if (!componentName) return;
    // Replace, not append — pagesConfig re-registers a theme's extensions on
    // every site-config build (HMR, multi-pattern loads, etc.); matching
    // sectionMenuExtensions' idempotency here avoids accumulating duplicate
    // builders across repeated calls with the same theme config.
    registry[componentName] = Array.isArray(builders) ? builders : [builders];
}

export function getSectionHeaderExtensions(componentName) {
    return registry[componentName] || [];
}
