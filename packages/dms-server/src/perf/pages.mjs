// The pages a run visits, from a pattern's page list (the CLI reads that list through the dms CLI, src/dms/perf/pages.js;
// the server's perf job gets it from the admin page that starts the run, ./index.js).

/** The pattern's home page: the first top-level page, which is what the pattern's base URL shows. */
export const homePage = (pages) => [...pages].filter((p) => !p.parent).sort((a, b) => a.index - b.index)[0] || pages[0];

/**
 * The pages a run visits. Default: every published page. `sample`: N pages spread evenly across the
 * list sorted by path, always with the home page, so the same pattern and N give the same pages.
 */
export function choosePages(all, { sample = null, pages = null } = {}) {
  const published = all.filter((p) => p.published).sort((a, b) => a.path.localeCompare(b.path));
  if (pages?.length) {
    const want = pages.map((s) => s.replace(/^\/+|\/+$/g, ''));
    const found = want.map((s) => all.find((p) => p.slug === s || p.path.replace(/^\/+/, '') === s || p.id === s));
    const missing = want.filter((_, i) => !found[i]);
    if (missing.length) throw new Error(`No such page(s) in the pattern: ${missing.join(', ')}`);
    return found;
  }
  if (!sample || sample >= published.length) return published;
  const home = homePage(published);
  const rest = published.filter((p) => p !== home);
  const n = Math.max(0, sample - 1);
  const picked = Array.from({ length: n }, (_, i) => rest[Math.floor((i + 0.5) * rest.length / n)]);
  return [home, ...new Set(picked)].filter(Boolean);
}
