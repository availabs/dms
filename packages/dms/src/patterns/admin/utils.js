import { resolveSubdomainAuthPermissions } from '../../render/spa/utils/index.js';

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

export function isUserAuthed(user, authPermissions = {}) {
  const authedGroups = authPermissions.groups || {};
  const authedUsers  = authPermissions.users  || {};
  const userPerms = [
    ...(authedUsers[user?.id] || []),
    ...(user?.groups || [])
      .filter(g => authedGroups[g])
      .flatMap(g => {
        const p = authedGroups[g];
        return Array.isArray(p) ? p : [p];
      })
  ];
  return userPerms.some(p => p === '*');
}

// Whether `user` may MANAGE a pattern in the admin panel (Sites list row,
// Pattern Editor) — an app admin always can; otherwise the pattern's own
// `authPermissions` (PatternPermissionsEditor's subdomain-keyed save shape —
// resolved here via `resolveSubdomainAuthPermissions`, not a naive
// `parseIfJSON`, which never finds a top-level `.groups`/`.users` on that
// shape) needs an explicit `'*'` grant for this user. A pattern with no
// grants at all — never configured (`rawAuthPermissions` falsy) OR
// explicitly saved with empty `groups`/`users` (the exact shape found on
// mitigat-ny-prod pattern 1006405) — is unrestricted rather than
// admin-only: nothing about it was ever locked down, so it shouldn't read as
// locked (2026-09-20).
export function hasPatternManageAccess(user, isAdmin, rawAuthPermissions, subdomain) {
  if (isAdmin) return true;
  const resolved = resolveSubdomainAuthPermissions(rawAuthPermissions, subdomain);
  const hasAnyGrant = Object.keys(resolved?.groups || {}).length > 0 || Object.keys(resolved?.users || {}).length > 0;
  if (!hasAnyGrant) return true;
  return isUserAuthed(user, resolved);
}
