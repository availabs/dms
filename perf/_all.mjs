// Every page of two saved runs' page lists, on two builds: is the rich text the same?
import { chromium } from 'playwright';
import fs from 'fs';
const lists = [['', '/home/alex/code/dms-template/scratchpad/hub-test/perf/2026-11-20-1430-availabs-local-base/run.json'], ['mny.', '/home/alex/code/dms-template/scratchpad/mny-test/perf/2026-11-20-1336-hub-prod-all-v2/run.json']];
const jobs = lists.flatMap(([sub, f]) => JSON.parse(fs.readFileSync(f)).pages.map((p) => [sub, p.path]));
const b = await chromium.launch({ channel: 'chrome' });
const grab = async (url) => {
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await p.goto(url, { waitUntil: 'load', timeout: 90000 });
    // settle: the editor count and the page height stop changing
    let prev = '', same = 0;
    for (let i = 0; i < 60 && same < 4; i++) { await p.waitForTimeout(500); const k = await p.evaluate(() => document.querySelectorAll('[data-lexical-editor]').length + ':' + document.querySelectorAll('[data-dms-loading]').length + ':' + document.documentElement.scrollHeight); same = k === prev ? same + 1 : 0; prev = k; }
    return await p.evaluate(() => ({ h: document.documentElement.scrollHeight, text: document.body.innerText.replace(/\s+/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?/gi, ''), editors: document.querySelectorAll('[data-lexical-editor]').length, html: [...document.querySelectorAll('[data-lexical-editor]')].map((e) => e.innerHTML.replace(/ id="[^"]*"/g, '')).sort().join('\n') }));
  } catch (e) { return { error: String(e.message).split('\n')[0] }; } finally { await p.close(); }
};
let next = 0; const out = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let i; (i = next++) < jobs.length;) {
    const [sub, path] = jobs[i];
    const a = await grab(`http://${sub}localhost:5556${path}`), c = await grab(`http://${sub}localhost:5557${path}`);
    const r = { page: sub + path, html: a.html === c.html, text: a.text === c.text, h: a.h === c.h, ha: a.h, hc: c.h, editors: `${a.editors}/${c.editors}`, err: a.error || c.error };
    if (!r.err && (!r.html || !r.h || !r.text)) {
      // is the old build even the same as itself on this page?
      const a2 = await grab(`http://${sub}localhost:5556${path}`), c2 = await grab(`http://${sub}localhost:5557${path}`);
      r.noise = { html: a.html !== a2.html, text: a.text !== a2.text, h: a.h !== a2.h };
      r.again = { html: a2.html === c2.html || a.html === c2.html || a2.html === c.html, text: a2.text === c2.text || a.text === c2.text || a2.text === c.text, h: a2.h === c2.h || a.h === c2.h || a2.h === c.h };
      if (a2.error || c2.error) { r.err = a2.error || c2.error; out.push(r); continue; }
      if (!r.again.html) { const x = a2.html.split(/(?=<)/), y = c2.html.split(/(?=<)/); let k = 0; while (k < x.length && x[k] === y[k]) k++; r.first = `[${x.slice(k, k + 2).join('').slice(0, 150)}] vs [${y.slice(k, k + 2).join('').slice(0, 150)}]`; }
    }
    out.push(r);
  }
}));
const ok = (r) => !r.err && ((r.html && r.h && r.text) || (r.again && r.again.html && r.again.h && r.again.text));
console.log('pages', out.length, '· identical first time', out.filter((r) => r.html && r.h && r.text).length, '· identical on a second look', out.filter((r) => ok(r) && !(r.html && r.h && r.text)).length, '· errors', out.filter((r) => r.err).length, '· different', out.filter((r) => !r.err && !ok(r)).length);
for (const r of out.filter((r) => r.err)) console.log('  ERR', r.page, r.err);
for (const r of out.filter((r) => !r.err && !ok(r))) console.log('  DIFF', JSON.stringify(r));
await b.close();
