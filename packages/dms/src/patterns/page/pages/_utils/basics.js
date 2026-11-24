// Page helpers that import nothing. Kept apart from ./index.js, which reaches the section registry (and with
// it every built-in section component): the islands browser entry's chrome and three UI primitives need only
// these (static-html-islands.md, priority C). Everything else imports them from ./index.js as before.

export const convertToUrlParams = (obj, delimiter='|||') => {
    const params = new URLSearchParams();

    Object.keys(obj).forEach(column => {
        const values = obj[column];
        if(!values || !Array.isArray(values) || !values?.length) return;
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
    });

    return params.toString();
};

export function timeAgo(input) {
  const date = (input instanceof Date) ? input : new Date(input);
  const formatter = new Intl.RelativeTimeFormat('en');
  const ranges = {
    years: 3600 * 24 * 365,
    months: 3600 * 24 * 30,
    weeks: 3600 * 24 * 7,
    days: 3600 * 24,
    hours: 3600,
    minutes: 60,
    seconds: 1
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (let key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      const delta = secondsElapsed / ranges[key];
      return formatter.format(Math.round(delta), key);
    }
  }
}

export const parseIfJSON = (text, fallback={}) => {
    try {
        if(text && typeof text === 'object') return text;
        if(typeof text !== 'string' || !text) return fallback;
        return JSON.parse(text)
    }catch (e){
        return fallback;
    }
}
