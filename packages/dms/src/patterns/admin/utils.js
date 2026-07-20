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
