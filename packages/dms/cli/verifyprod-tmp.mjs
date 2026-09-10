import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('https://westchester.hazardmitigation.ny.gov/track_progress',{waitUntil:'networkidle',timeout:90000});
await p.waitForTimeout(6000);
const rows=[];
for (const a of await p.$$('a')) {
  const t=((await a.textContent())||'').trim();
  if(/Actions Dashboard/i.test(t)) rows.push({href:await a.getAttribute('href'), visible: await a.isVisible()});
}
console.log('=== PRODUCTION westchester.hazardmitigation.ny.gov ===');
console.log('  "Actions Dashboard" anchors:');
rows.forEach(r=>console.log(`     visible=${r.visible} href=${r.href}`));
console.log('  honours nav_link yet:', rows.some(r=>r.href==='/actions/dashboard'));
await p.goto('https://westchester.hazardmitigation.ny.gov/track_progress/actions_dashboard',{waitUntil:'networkidle',timeout:90000});
await p.waitForTimeout(7000);
console.log('  old URL lands on:', p.url());
const t=((await p.textContent('body'))||'').replace(/\s+/g,' ');
console.log('  old URL renders county copy:', /Westchester/.test(t), '| body len', t.length);
await b.close();
