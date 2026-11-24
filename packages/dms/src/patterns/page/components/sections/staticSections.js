import { getRegisteredComponents } from './componentRegistry'

// islands path (render/islands, static-html-islands.md). Whether a section renders as static HTML on a
// server-rendered page, from its registry entry's `serverStatic` (true, or a function of the section's
// element-data). A section that isn't static stays live in the browser as a section island
// (CapturedSection.jsx, render/islands/SectionIslands.jsx). A section that is static by its settings can still
// turn out to need the browser while it renders (useDataLoader marks its capture), and becomes an island too.
export function sectionServerStatic(section) {
    const registry = getRegisteredComponents();
    const type = section?.element?.['element-type'] || 'lexical';
    const comp = registry[type] || registry.lexical;
    const elementData = section?.element?.['element-data'];
    return typeof comp?.serverStatic === 'function' ? Boolean(comp.serverStatic(elementData)) : Boolean(comp?.serverStatic);
}

// A section whose registry entry says `wakeOnUse` (true, or a function of its element-data) is an island
// that keeps its server HTML until the reader uses it: points at it, focuses it, touches it, or changes the
// page's state (render/islands/IslandHost.jsx). For a type whose server HTML already shows what the live
// section would, and whose live behaviour all starts with the reader. Like `serverStatic`, the section can
// still find out while it renders that its rows load in the browser (useDataLoader), and then mounts at once.
export function sectionWakeOnUse(section) {
    const registry = getRegisteredComponents();
    const type = section?.element?.['element-type'] || 'lexical';
    const comp = registry[type] || registry.lexical;
    const elementData = section?.element?.['element-data'];
    return typeof comp?.wakeOnUse === 'function' ? Boolean(comp.wakeOnUse(elementData)) : Boolean(comp?.wakeOnUse);
}

// A section type whose registry entry says `serverIsland: false` can't run as an island (it needs
// something only the full page view provides); a page holding one that isn't static stays on today's path.
export function sectionIslandRefused(section) {
    const registry = getRegisteredComponents();
    const type = section?.element?.['element-type'] || 'lexical';
    return (registry[type] || registry.lexical)?.serverIsland === false;
}
