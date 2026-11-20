// Every page of two saved runs' page lists, on two builds: is the rich text the same?
import { chromium } from 'playwright';
import fs from 'fs';
const lists = [['', '/home/alex/code/dms-template/scratchpad/hub-test/perf/2026-11-20-1430-availabs-local-base/run.json'], ['mny.', '/home/alex/code/dms-template/scratchpad/mny-test/perf/2026-11-20-1336-hub-prod-all-v2/run.json']];
const jobs = lists.flatMap(([sub, f]) => JSON.parse(fs.readFileSync(f)).pages.map((p) => [sub, p.path]));
const b = await chromium.launch({ channel: 'chrome' });
const grab = async (url) => {
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    // settle: the editor count and the page height stop changing
    let prev = '', same = 0;
    for (let i = 0; i < 60 && same < 4; i++) { await p.waitForTimeout(500); const k = await p.evaluate(() => document.querySelectorAll('[data-lexical-editor]').length + ':' + document.querySelectorAll('[data-dms-loading]').length + ':' + document.documentElement.scrollHeight); same = k === prev ? same + 1 : 0; prev = k; }
    return await p.evaluate(() => ({ h: document.documentElement.scrollHeight, editors: document.querySelectorAll('[data-lexical-editor]').length, html: [...document.querySelectorAll('[data-lexical-editor]')].map((e) => e.innerHTML.replace(/ id="[^"]*"/g, '')).join('\n') }));
  } catch (e) { return { error: String(e.message).split('\n')[0] }; } finally { await p.close(); }
};
let next = 0; const out = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let i; (i = next++) < jobs.length;) {
    const [sub, path] = jobs[i];
    const a = await grab(`http://${sub}localhost:5556${path}`), c = await grab(`http://${sub}localhost:5557${path}`);
    out.push({ page: sub + path, html: a.html === c.html, h: a.h === c.h, ha: a.h, hc: c.h, editors: `${a.editors}/${c.editors}`, la: a.html?.length, lc: c.html?.length, err: a.error || c.error });
  }
}));
const bad = out.filter((r) => !r.html || r.err);
console.log('pages', out.length, 'rich-text HTML same', out.filter((r) => r.html).length, 'height same', out.filter((r) => r.h).length, 'errors', out.filter((r) => r.err).length);
for (const r of bad) console.log('  HTML DIFF', JSON.stringify(r));
for (const r of out.filter((r) => r.html && !r.h)) console.log('  height only', r.page, r.ha, r.hc);
await b.close();
