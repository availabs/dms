import { readSitePatternRefs, mergeSitePatternRefs } from '../../utils/tenantProvisioning'

export function parseIfJSON(text, fallback = {}) {
  try {
    if (text && typeof text === 'object') return text;
    if (typeof text !== 'string' || !text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function timeAgo(input) {
  const date = input instanceof Date ? input : new Date(input);
  const fmt = new Intl.RelativeTimeFormat('en');
  const ranges = {
    years: 3600 * 24 * 365,
    months: 3600 * 24 * 30,
    weeks: 3600 * 24 * 7,
    days: 3600 * 24,
    hours: 3600,
    minutes: 60,
    seconds: 1,
  };
  const s = (date.getTime() - Date.now()) / 1000;
  for (const k in ranges) {
    if (ranges[k] < Math.abs(s)) return fmt.format(Math.round(s / ranges[k]), k);
  }
}

// Admin access checks (site level and per pattern) live in utils/adminPermissions.js.

// Save a list attribute of the site row (`patterns`, `tenants`). The page's copy
// can be stale: with sync on it's the local store's, which never sees refs
// written straight to the server (createSite's auth/admin/template refs, the
// admin backfill, tenant signup appending to `tenants`). Writing it as-is
// dropped them, so merge against the server's list first: keep what the server
// has that this page never loaded, but not what the user just removed.
// Returns apiUpdate's promise, so a caller can wait for the save itself.
export async function saveSiteRefList({ falcor, apiUpdate, format, app, item, attrKey, data }) {
	if (Array.isArray(data)) {
		try {
			const server = await readSitePatternRefs(falcor, app, item?.id, attrKey)
			data = mergeSitePatternRefs({ edited: data, baseline: item?.[attrKey] || [], server })
		} catch (err) {
			console.error(`Could not re-read the site's ${attrKey} before saving; saving the list as shown:`, err)
		}
	}
	return apiUpdate({ data: { ...item, [attrKey]: data }, config: { format } })
}
