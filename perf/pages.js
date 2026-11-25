// The page list for a pattern, read through the dms CLI. Which of them a run visits: dms-server's src/perf/pages.mjs.
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

export { homePage, choosePages } from '../packages/dms-server/src/perf/pages.mjs';
