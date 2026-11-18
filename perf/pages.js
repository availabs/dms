// The page list for a pattern, and the pages a run visits.
import { fetchAll, resolvePattern, parseData } from '../packages/dms/cli/src/utils/data.js';
import { pageTypeFor } from '../packages/dms/cli/src/utils/types.js';

const join = (base, slug) => ('/' + [base, slug].map((s) => String(s || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/'));

/** Every page row of the pattern, with the path it is served at. */
export async function listPages(falcor, config, patternNameOrId) {
  const pattern = await resolvePattern(falcor, config, patternNameOrId);
  const pdata = parseData(pattern.data);
  const { items } = await fetchAll(falcor, `${config.app}+${pageTypeFor(pattern)}`, ['id', 'data'], { limit: 100000, offset: 0 });
  const pages = items.map((p) => {
    const d = parseData(p.data);
    return {
      id: String(p.id), slug: d.url_slug || '', title: d.title || '', parent: d.parent ? String(d.parent) : null,
      index: +d.index || 0, published: (d.published ?? 'draft') !== 'draft',
      path: join(pdata.base_url, d.url_slug),
    };
  }).filter((p) => p.id !== 'no-access');
  return {
    pattern: { id: String(pattern.id), name: pdata.name, base_url: pdata.base_url || '/', subdomain: pdata.subdomain || '*', preload_data: pdata.preload_data === true },
    pages,
  };
}

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
