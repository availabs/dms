/**
 * Headless rendering for the PDF exporter: one Chromium per job, each page printed the way the site
 * shows it on a desktop, once its data has loaded.
 *
 * Readiness is waited for, not guessed. Page sections load their data after the document does, and a
 * slow query can take a while, so a page is ready when, for QUIET_MS straight, no HTTP request is in
 * flight AND nothing in the DOM carries `data-dms-loading` (the client's loading contract: dataWrapper
 * sets it while it fetches). Ported from avail-falcor's dama/routes/data_types/pdf-generator, which
 * printed on `networkidle2` (two requests may still be open) with a 60 s cap and a new browser per page.
 *
 * Paper comes last. Each page prints as one sheet as tall as the page (Chrome's own pagination
 * re-flows grid sections at each break and they overlap), and appendPdf slices it onto Letter sheets
 * at points that cut no line of text, image or card, over a background layer of the site's surface.
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = require('pdf-lib');

const PAGE_TIMEOUT_MS = +process.env.DMS_PDF_PAGE_TIMEOUT_MS || 120_000;
const QUIET_MS = 1000;
const POLL_MS = 250;
// A request open longer than this is a stream (long-poll, SSE over fetch), not a load to wait for.
const STREAM_MS = 30_000;

// The desktop layout, printed to fit US Letter: the page lays out at LAYOUT_WIDTH CSS px and is scaled
// onto the printable width, so the PDF has the site's desktop layout rather than the 816 px tablet one.
const LAYOUT_WIDTH = 1200;
const PAPER = { width: 8.5, height: 11 };                  // inches
const MARGIN = { top: 0.4, right: 0.4, bottom: 0.5, left: 0.4 };
// A sheet's printable area in layout px: how much of the page goes on one sheet.
const SHEET_PX = ((PAPER.height - MARGIN.top - MARGIN.bottom) * LAYOUT_WIDTH) / (PAPER.width - MARGIN.left - MARGIN.right);

// Where an author ends a sheet: the rich-text editor's Page Break (a `figure[type=page-break]`, shown in
// the page as a grey bar) and the legacy `.print-page-break` hook. Either starts a new sheet when slicing.
const PAGE_BREAKS = 'figure[type="page-break"], .print-page-break';

// Hides the site's navigation (Layout wraps TopNav / SideNav in a `data-dms-chrome` element) and the
// page-break bars, which only mark where a sheet ends.
const EXPORT_CSS = `
  [data-dms-chrome] { display: none !important; }
  .pdf-hidden { display: none !important; }
  figure[type="page-break"], .print-page-break {
    display: block !important; height: 0 !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; background: none !important; visibility: hidden !important;
  }
`;

// The background layer: every element hidden except the layout surface (the ancestors of the nav
// markers, or body), so the sheet margins and the space under a cut show the site's own background.
const BACKGROUND_CSS = `body * { visibility: hidden !important; }`;

const CHROME_PATHS = [
  process.env.DMS_PDF_CHROME,
  process.env.PUPPETEER_EXECUTABLE_PATH,   // dms-template's deploy image sets this for its own loaders
  '/usr/bin/chromium',            // Debian's package (both server images)
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

function chromePath() {
  const found = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!found) throw new Error(`PDF export needs Chromium: none found at ${CHROME_PATHS.join(', ')} (set DMS_PDF_CHROME)`);
  return found;
}

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
}

/**
 * A fresh tab in the job's (incognito) context. In `self` mode the caller's token is in localStorage
 * before the site's code runs, so pages render as that person; in `public` mode there is none.
 */
async function openTab(context, token) {
  const page = await context.newPage();
  await page.setViewport({ width: LAYOUT_WIDTH, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  if (token) await page.evaluateOnNewDocument(t => localStorage.setItem('userToken', t), token);
  // A site with local sync on (VITE_DMS_SYNC) downloads the whole pattern into the browser on every
  // load (/sync/bootstrap, ~30 s on MitigateNY), and the page waited for it. Printing never reads that
  // mirror: refused, the client reads from the API as it does with sync off (its offline fallback).
  await page.evaluateOnNewDocument(() => {
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url || `${input || ''}`;
      try {
        if (new URL(url, location.href).pathname.startsWith('/sync/')) return Promise.reject(new TypeError('sync is off in PDF export'));
      } catch { /* not a URL: let fetch report it */ }
      return realFetch.call(this, input, init);
    };
  });

  const inflight = new Map();
  page.on('request', req => {
    if (['websocket', 'eventsource'].includes(req.resourceType())) return;
    inflight.set(req, Date.now());
  });
  const settle = req => inflight.delete(req);
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  page._dmsInflight = () => {
    const now = Date.now();
    let n = 0;
    for (const started of inflight.values()) if (now - started < STREAM_MS) n++;
    return n;
  };
  return page;
}

/** Waits until the network and every `data-dms-loading` section have been quiet for QUIET_MS. */
async function waitForReady(page, deadline) {
  let quietSince = null;
  while (Date.now() < deadline) {
    const loading = await page.evaluate(() => document.querySelectorAll('[data-dms-loading]').length).catch(() => 1);
    if (page._dmsInflight() === 0 && loading === 0) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince >= QUIET_MS) return true;
    } else {
      quietSince = null;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  return false;
}

// Scrolls to the bottom one screen at a time so sections that load on view do, then back to the top.
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
}

// Headless print draws WebGL canvases blank: swap each visible canvas for a picture of itself.
async function freezeCanvases(page) {
  const handles = await page.$$('canvas');
  for (const handle of handles) {
    const box = await handle.boundingBox();
    if (!box || box.width < 2 || box.height < 2) continue;
    const png = await handle.screenshot({ encoding: 'base64' }).catch(() => null);
    if (!png) continue;
    await handle.evaluate((el, src) => {
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${src}`;
      img.style.cssText = `width:${el.clientWidth}px;height:${el.clientHeight}px;display:block;` + el.style.cssText;
      img.className = el.className;
      el.style.display = 'none';
      el.after(img);
    }, png);
  }
}

// Text and heading styles from the page's content, for page numbers and the contents page (the
// heading's font, not its colour: the first h1 is often white on a hero image); and the
// layout surface's background (the nearest nav-marker ancestor that paints one), which the contents
// page reuses so it sits on the same background as the pages around it.
async function pageLook(page) {
  return page.evaluate(() => {
    const painted = (el) => {
      const cs = getComputedStyle(el);
      return cs.backgroundImage !== 'none' || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor);
    };
    let surface = document.body;
    for (let el = document.querySelector('[data-dms-chrome]'); el; el = el.parentElement) {
      if (painted(el)) { surface = el; break; }
    }
    const cs = getComputedStyle(surface);
    const para = document.querySelector('[data-dms-group] p, p') || document.body;
    const heading = document.querySelector('h1') || document.querySelector('h2');
    const pick = (el, keys) => {
      if (!el) return null;
      const st = getComputedStyle(el);
      return Object.fromEntries(keys.map(k => [k, st[k]]));
    };
    return {
      surface: {
        backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, backgroundSize: cs.backgroundSize,
        backgroundRepeat: cs.backgroundRepeat, backgroundPosition: cs.backgroundPosition,
      },
      text: pick(para, ['color', 'fontFamily', 'fontSize', 'lineHeight']),
      heading: pick(heading, ['color', 'fontFamily', 'fontWeight', 'fontSize', 'letterSpacing', 'textTransform']),
    };
  });
}

/**
 * Where a sheet may end. Returns the page height and, in layout px, the spans a cut must not pass
 * through: every line of text, image, svg, canvas, table row and form control, and every painted box
 * (card, stat tile, button) shorter than half a sheet. `boxes` are the taller painted boxes (a whole
 * card, a panel), which a cut may pass through but would rather not. Plus the authored page breaks.
 */
async function measure(page) {
  return page.evaluate((halfSheet, breakSelector) => {
    const y = window.scrollY;
    const spans = [];
    const boxes = [];
    const box = (r) => [Math.floor(r.top + y), Math.ceil(r.bottom + y)];
    const add = (r) => { if (r.height > 0 && r.width > 0) spans.push(box(r)); };
    const hidden = (el) => !el || el.closest('[data-dms-chrome], .pdf-hidden');

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.trim() && !hidden(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }
    const ATOMIC = 'img, svg, canvas, video, iframe, tr, button, input, select, textarea';
    for (const el of document.body.querySelectorAll('*')) {
      if (hidden(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      if (el.matches(ATOMIC)) { if (!el.closest('svg') || el.tagName.toLowerCase() === 'svg') add(r); continue; }
      const cs = getComputedStyle(el);
      const boxed = cs.boxShadow !== 'none' || cs.backgroundImage !== 'none'
        || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor)
        || ['Top', 'Bottom', 'Left', 'Right'].some(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
      if (!boxed) continue;
      if (r.height < halfSheet) add(r);
      else if (r.width > 0 && !el.querySelector('[data-dms-chrome]')) boxes.push(box(r));   // not the layout surface
    }
    const breaks = [...document.querySelectorAll(breakSelector)].map(el => Math.round(el.getBoundingClientRect().top + y));
    const headings = [...document.body.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter(el => !hidden(el)).map(el => el.getBoundingClientRect()).filter(r => r.height > 0).map(box);
    const height = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    return { height, spans, boxes, breaks, headings };
  }, SHEET_PX / 2, PAGE_BREAKS);
}

/**
 * In print, `vh` is a share of the sheet, not the window, so on a sheet as tall as the page a
 * `min-h-screen` hero grows to the whole page and pushes everything below off the print. Pins every
 * declaration that uses a viewport-height unit to the px it has on screen now (inline, !important).
 */
async function freezeViewportHeights(page) {
  await page.evaluate(() => {
    const VH = /\d(vh|svh|lvh|dvh|vmin|vmax)\b/;
    const pin = (el, prop) => {
      const value = getComputedStyle(el).getPropertyValue(prop);
      if (value && /px$/.test(value)) el.style.setProperty(prop, value, 'important');
    };
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.cssRules) walk(rule.cssRules);          // @media, @layer, @supports, nesting
        if (!rule.style || !rule.selectorText || !VH.test(rule.style.cssText)) continue;
        const props = [...rule.style].filter(p => VH.test(rule.style.getPropertyValue(p)));
        let els;
        try { els = document.querySelectorAll(rule.selectorText); } catch { continue; }
        els.forEach(el => props.forEach(p => pin(el, p)));
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ }
    }
    document.querySelectorAll('[style*="vh"], [style*="vmin"], [style*="vmax"]').forEach(el => {
      [...el.style].filter(p => VH.test(el.style.getPropertyValue(p))).forEach(p => pin(el, p));
    });  });
}

/**
 * Chrome lays grids out in paged mode when printing, even on one sheet, and there it sizes some rows
 * differently from the screen. MNY's hazard cards (an image pulled up out of each card, rows of
 * `minmax(max-content, …)`) printed taller than their row and ran into the pagination below. Pins every
 * grid's tracks to the px sizes they resolve to on screen, so the sheet gets the screen's rows.
 */
async function freezeGrids(page) {
  await page.evaluate(() => {
    const PX_LIST = /^[\d.\spx]+$/;            // only plain track sizes; named lines / subgrid are left alone
    const grids = [...document.body.querySelectorAll('*')].filter(el => /grid/.test(getComputedStyle(el).display));
    // read every grid before writing any, so one pin can't change another's reading
    const tracks = grids.map(el => { const cs = getComputedStyle(el); return [cs.gridTemplateRows, cs.gridTemplateColumns]; });
    grids.forEach((el, i) => {
      const [rows, cols] = tracks[i];
      if (PX_LIST.test(rows)) {
        el.style.setProperty('grid-template-rows', rows, 'important');
        el.style.setProperty('grid-auto-rows', 'auto', 'important');
      }
      if (PX_LIST.test(cols)) el.style.setProperty('grid-template-columns', cols, 'important');
    });
  });
}

/**
 * Prints the page as ONE sheet as tall as the page, so nothing is re-flowed across sheets (Chrome's
 * own pagination moves grid items past a break and they overlap what follows). Then prints the
 * background layer at the same size. Slicing onto paper happens in appendPdf.
 */
async function printTall(page) {
  await freezeViewportHeights(page);
  await freezeGrids(page);
  const m = await measure(page);
  const opts = {
    width: `${LAYOUT_WIDTH}px`, height: `${m.height + 1}px`, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1', timeout: 0,
  };
  const content = await page.pdf(opts);
  await page.addStyleTag({ content: BACKGROUND_CSS });
  await page.evaluate(() => {
    for (let el = document.querySelector('[data-dms-chrome]'); el && el !== document.body; el = el.parentElement) {
      el.style.setProperty('visibility', 'visible', 'important');
    }
    document.querySelectorAll('[data-dms-chrome]').forEach(el => el.style.setProperty('visibility', 'hidden', 'important'));
  });
  const background = await page.pdf(opts);
  return { content, background, ...m };
}

/**
 * Loads one page, waits for it, and prints it. Returns { pdf, look } or { skipped: reason }, where
 * `pdf` is printTall's result. A page the viewer can't open is skipped: the site redirected away from
 * it (sign-in), or it shows the page pattern's no-access screen (`data-dms-no-access`).
 */
async function renderPage(context, url, { token, isCancelled = () => false } = {}) {
  const page = await openTab(context, token);
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.addStyleTag({ content: EXPORT_CSS });
    let ready = await waitForReady(page, deadline);
    if (isCancelled()) return { skipped: 'cancelled' };

    const wanted = new URL(url);
    const landed = new URL(page.url());
    if (landed.origin !== wanted.origin || landed.pathname.replace(/\/$/, '') !== wanted.pathname.replace(/\/$/, '')) {
      return { skipped: 'not visible to this viewer' };
    }
    if (await page.$('[data-dms-no-access]')) return { skipped: 'not visible to this viewer' };

    await scrollThrough(page);
    ready = (await waitForReady(page, deadline)) && ready;
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);
    await freezeCanvases(page);
    const look = await pageLook(page);
    const pdf = await printTall(page);
    return { pdf, look, timedOut: !ready };
  } finally {
    await page.close().catch(() => {});
  }
}

const escapeHtml = (s) => `${s ?? ''}`.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * A tab on one of the exported pages, for the contents page: it carries the site's fonts and CSS.
 * Opened while the pages print, so the contents page doesn't wait for a page load at the end.
 */
async function openStyleTab(context, styleUrl, { token } = {}) {
  const page = await openTab(context, token);
  try {
    await page.goto(styleUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await waitForReady(page, Date.now() + 30_000);
    return page;
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
}

/**
 * The contents page, printed in a tab from openStyleTab (which it closes), on the exported pages'
 * layout background and styled from their heading and text.
 * `entries`: [{ title, depth, pageNumber }]. Returns the same shape as renderPage's `pdf`.
 */
async function renderContents(page, entries, look) {
  try {
    await page.emulateMediaType('print');
    const h = look?.heading || {};
    const t = look?.text || {};
    const rows = entries.map(e => `
      <li style="display:flex;gap:12px;align-items:baseline;padding:6px 0 6px ${e.depth * 24}px;${e.depth ? '' : 'font-weight:600;'}">
        <span style="flex:1">${escapeHtml(e.title)}</span>
        <span style="font-variant-numeric:tabular-nums">${e.pageNumber ?? ''}</span>
      </li>`).join('');
    const html = `
      <div style="padding:48px 24px;color:${t.color || '#000'};font-family:${t.fontFamily || 'sans-serif'};font-size:${t.fontSize || '16px'};line-height:${t.lineHeight || '1.5'}">
        <h1 style="margin:0 0 40px;color:inherit;font-family:${h.fontFamily || 'inherit'};font-weight:${h.fontWeight || 600};font-size:${h.fontSize || '40px'};letter-spacing:${h.letterSpacing || 'normal'};text-transform:${h.textTransform || 'none'}">Contents</h1>
        <ol style="list-style:none;margin:0;padding:0">${rows}</ol>
      </div>`;
    await page.evaluate((markup, surface) => {
      document.body.innerHTML = markup;
      document.body.style.margin = '0';
      Object.assign(document.body.style, surface || {});
    }, html, look?.surface);
    await page.evaluate(() => document.fonts.ready);
    return await printTall(page);
  } finally {
    await page.close().catch(() => {});
  }
}

const parseRgb = (c) => {
  const m = `${c || ''}`.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? rgb(+m[1] / 255, +m[2] / 255, +m[3] / 255) : rgb(0, 0, 0);
};

// Space kept above the content that starts a sheet.
const SHEET_LEAD_PX = 24;

/**
 * Where each sheet starts and ends, in layout px. A sheet ends as low as possible within its lower
 * half, never through a span (a line of text, an image, a small card) or between a heading and what
 * follows it, and through as few of the big boxes (a whole card or panel) as it can. An authored page break ends a sheet early. A span taller than the sheet's lower half gets cut
 * at the sheet's end. The next sheet starts at the next content, so it doesn't open on the empty
 * bottom of a panel; a page whose remainder is empty adds no sheet.
 */
function sheetCuts({ height, spans: lines, boxes = [], breaks, headings = [] }) {
  // a heading and the first thing below it are one span
  const spans = [...lines, ...headings.map(([t, b]) => {
    const next = Math.min(...lines.map(([lt]) => lt).filter(lt => lt >= b - 1 && lt > t));
    return [t, Number.isFinite(next) ? next + 2 : b];
  })];
  const blocked = (c) => spans.some(([t, b]) => t < c - 1 && b > c + 1);
  const candidates = [...new Set([...spans.flat(), ...boxes.flat(), ...breaks])].filter(c => c > 0 && c < height).sort((a, b) => b - a);
  const cuts = [];
  let y = 0;
  // An authored break that lands inside something (a hero photo) moves down to the first clear spot.
  const clearBelow = (c) => [...candidates].reverse().find(k => k >= c && !blocked(k)) ?? height;
  const forcedCuts = [...new Set(breaks.map(clearBelow))].sort((a, b) => a - b);
  while (height - y > 2) {
    const limit = y + SHEET_PX;
    const forced = forcedCuts.find(c => c > y + 20 && c <= limit && c < height);
    let cut;
    if (forced != null) cut = forced;
    else if (limit >= height) cut = height;
    else {
      // the lowest of the spots that cross the fewest boxes (the page's own panel may hold everything)
      const crossings = (c) => boxes.filter(([t, b]) => t < c - 1 && b > c + 1).length;
      const ok = candidates.filter(c => c <= limit && c > y + SHEET_PX / 2 && !blocked(c));
      const fewest = Math.min(...ok.map(crossings));
      cut = ok.find(c => crossings(c) === fewest) ?? limit;
    }
    cuts.push([y, cut]);
    const nextContent = Math.min(...[...spans, ...boxes].map(([t]) => t).filter(t => t >= cut));
    if (!Number.isFinite(nextContent)) break;
    y = Math.max(cut, nextContent - SHEET_LEAD_PX);
    // nor inside the rest of a panel the cut went through: that rest is only its empty bottom edge
    for (const [t, bottom] of boxes) if (t < cut - 1 && bottom > cut + 1) y = Math.max(y, Math.min(bottom, nextContent));
  }
  return cuts;
}

/**
 * Slices a printed page onto Letter sheets and adds them to `out`: the background layer under the
 * whole sheet, then the slice of the page, clipped to the printable area. `fit` puts the whole page on
 * one sheet instead (the cover). With `firstNumber`, each sheet is numbered in its bottom margin.
 * Returns the number of sheets added.
 */
async function appendPdf(out, printed, { look, firstNumber, font, fit = false } = {}) {
  const [content] = await out.embedPdf(printed.content, [0]);
  const [background] = await out.embedPdf(printed.background, [0]);
  const W = PAPER.width * 72;
  const H = PAPER.height * 72;
  const srcH = content.height;                       // pt; 1 layout px = 0.75 pt
  const ink = parseRgb(look?.text?.color);
  // The surface's colour: its background-color, or the first colour of its gradient (MNY paints a
  // 96% grey gradient over a texture image, with no background-color), else white.
  const sf = look?.surface || {};
  const opaque = (c) => c && !/^(transparent|rgba\(.*,\s*0\))$/.test(c);
  const surface = opaque(sf.backgroundColor) ? parseRgb(sf.backgroundColor)
    : /rgba?\(/.test(sf.backgroundImage || '') ? parseRgb(sf.backgroundImage) : rgb(1, 1, 1);
  const m = fit ? { top: 0, right: 0, bottom: 0, left: 0 }
    : { top: MARGIN.top * 72, right: MARGIN.right * 72, bottom: MARGIN.bottom * 72, left: MARGIN.left * 72 };
  const areaW = W - m.left - m.right;
  const areaH = H - m.top - m.bottom;
  const scale = fit ? Math.min(areaW / content.width, areaH / srcH) : areaW / content.width;
  const bgScale = W / background.width;
  const slices = fit ? [[0, printed.height]] : sheetCuts(printed);

  slices.forEach(([a, b], i) => {
    const sheet = out.addPage([W, H]);
    const topPt = srcH - a * 0.75;                     // the slice's top, in the printed page's coordinates
    // the surface colour first, so the sheet past the page's end isn't white; then the surface itself,
    // full sheet width, lined up with the slice
    sheet.drawRectangle({ x: 0, y: 0, width: W, height: H, color: surface });
    sheet.drawPage(background, { x: 0, y: H - m.top - topPt * bgScale, xScale: bgScale, yScale: bgScale });
    const sliceH = (b - a) * 0.75 * scale;
    const x = m.left + (fit ? (areaW - content.width * scale) / 2 : 0);
    sheet.pushOperators(pushGraphicsState(), rectangle(x, H - m.top - sliceH, content.width * scale, sliceH), clip(), endPath());
    sheet.drawPage(content, { x, y: H - m.top - topPt * scale, xScale: scale, yScale: scale });
    sheet.pushOperators(popGraphicsState());
    if (firstNumber != null && font) {
      const label = `${firstNumber + i}`;
      const size = 8;
      sheet.drawText(label, { x: (W - font.widthOfTextAtSize(label, size)) / 2, y: m.bottom / 2 - size / 2, size, font, color: ink });
    }
  });
  return slices.length;
}

async function newDocument() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, font };
}

module.exports = { launchBrowser, renderPage, openStyleTab, renderContents, appendPdf, newDocument, PDFDocument, sheetCuts };
