import { getRegisteredComponents } from './componentRegistry'

// RSC path (render/rsc, rsc-view-pages.md phase 2). Whether a section renders as static HTML on a
// server-rendered page, from its registry entry's `serverStatic` (true, or a function of the section's
// element-data). A section that isn't static stays live in the browser as a section island
// (RscSection.jsx, render/rsc/SectionIslands.jsx). A section that is static by its settings can still
// turn out to need the browser while it renders (useDataLoader marks its capture), and becomes an island too.
export function sectionServerStatic(section) {
    const registry = getRegisteredComponents();
    const type = section?.element?.['element-type'] || 'lexical';
    const comp = registry[type] || registry.lexical;
    const elementData = section?.element?.['element-data'];
    return typeof comp?.serverStatic === 'function' ? Boolean(comp.serverStatic(elementData)) : Boolean(comp?.serverStatic);
}

// A section type whose registry entry says `serverIsland: false` can't run as an island (it needs
// something only the full page view provides); a page holding one that isn't static stays on today's path.
export function sectionIslandRefused(section) {
    const registry = getRegisteredComponents();
    const type = section?.element?.['element-type'] || 'lexical';
    return (registry[type] || registry.lexical)?.serverIsland === false;
}
