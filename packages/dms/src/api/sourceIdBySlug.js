// The source each dataset name (slug) resolves to in `app`, as { [slug]: sourceId | null }.
// It's the server's own routing lookup (`dms.sourceIdBySlug`), so a non-null id means rows
// named `<slug>|<view>:data` already belong to that source. The cached answer is dropped
// first: a name can become taken between two checks.
export async function getSourceIdsBySlug(falcor, app, slugs = []) {
  if (!slugs.length) return {};
  await falcor.invalidate(['dms', 'sourceIdBySlug', app]);
  const res = await falcor.get(['dms', 'sourceIdBySlug', app, slugs]);
  const found = res?.json?.dms?.sourceIdBySlug?.[app] || {};
  return Object.fromEntries(slugs.map(slug => [slug, found[slug] ?? null]));
}
