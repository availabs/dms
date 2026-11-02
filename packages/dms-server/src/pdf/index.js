/**
 * PDF export: renders a list of site pages to one PDF, as a background job.
 *
 *   POST   /pdf/export            { pages: [{url, title, depth}], cover_url, toc, file_name, mode } → { id }
 *   GET    /pdf/export/:id        → { state, done, total, current, skipped, timedOut, error }
 *   GET    /pdf/export/:id/file   → <file_name>.zip holding <file_name>.pdf
 *   DELETE /pdf/export/:id        → cancels
 *
 * A job, not one long request: nginx in front of the server cuts proxied requests at 120 s, and a large
 * plan takes minutes. No permission is needed. Headless Chrome opens the pages either as an anonymous
 * visitor (`mode: 'public'`, the default) or with the caller's own token (`mode: 'self'`, sent as the
 * Authorization header), so the most anyone gets is the pages they could open anyway; pages that viewer
 * can't open are left out and listed in `skipped`. The job id is a random UUID and is the only key to
 * the file.
 */
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { launchBrowser, renderPage, openStyleTab, renderContents, appendPdf, newDocument } = require('./render');

const CONCURRENCY = Math.max(1, +process.env.DMS_PDF_CONCURRENCY || 1);
// Pages one job prints at once, each in its own tab of the job's browser. Most of a page's time is
// waiting on its data, so a few tabs overlap those waits.
const TABS = Math.max(1, +process.env.DMS_PDF_TABS || 3);
const MAX_PAGES = 1000;
const KEEP_MS = 60 * 60 * 1000;          // finished jobs (and their files) are dropped after an hour
// Finished zips wait on disk (the server's persistent var/ volume), not in memory: they can be large.
const FILE_DIR = path.resolve(__dirname, '../../var/pdf-exports');

const jobs = new Map();
const queue = [];
let running = 0;

const safeName = (s) => `${s || 'export'}`.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'export';

function status(job) {
  const { id, state, done, total, current, skipped, timedOut, error, fileName, finishedAt } = job;
  return { id, state, done, total, current, skipped, timedOut, error, fileName, finishedAt };
}

function finish(job, state, error) {
  job.state = state;
  job.error = error || null;
  job.finishedAt = Date.now();
  delete job.token;
  setTimeout(() => {
    jobs.delete(job.id);
    if (job.file) fs.rm(job.file, { force: true }, () => {});
  }, KEEP_MS).unref?.();
}

async function run(job) {
  const browser = await launchBrowser();
  try {
    const context = await browser.createBrowserContext();
    const { doc } = await newDocument();
    const isCancelled = () => job.state === 'cancelled';
    const opts = { token: job.token, isCancelled };

    // The cover and the contents page's tab load alongside the pages.
    const coverJob = job.coverUrl
      ? renderPage(context, job.coverUrl, opts).catch(e => ({ skipped: e.message }))
      : null;
    const styleTab = job.toc
      ? openStyleTab(context, job.pages[0].url, { token: job.token }).catch(() => null)
      : null;

    const results = new Array(job.pages.length);
    const rendering = new Set();
    let next = 0;
    const worker = async () => {
      while (next < job.pages.length && !isCancelled()) {
        const i = next++;
        const entry = job.pages[i];
        rendering.add(entry.title || entry.url);
        job.current = [...rendering].join(', ');
        try {
          results[i] = await renderPage(context, entry.url, opts);
        } catch (e) {
          results[i] = { skipped: `failed: ${e.message}` };
        }
        rendering.delete(entry.title || entry.url);
        job.current = [...rendering].join(', ') || null;
        job.done++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(TABS, job.pages.length) }, worker));

    const printed = [];                       // [{ entry, bytes, look }], in the order asked for
    job.pages.forEach((entry, i) => {
      const res = results[i];
      if (!res) return;
      if (res.skipped) {
        if (res.skipped !== 'cancelled') job.skipped.push({ title: entry.title, url: entry.url, reason: res.skipped });
      } else {
        if (res.timedOut) job.timedOut.push({ title: entry.title, url: entry.url });
        printed.push({ entry, bytes: res.pdf, look: res.look });
      }
    });
    if (isCancelled()) {
      (await styleTab)?.close().catch(() => {});
      return;
    }
    if (!printed.length) return finish(job, 'failed', 'No page could be printed.');
    const firstLook = printed[0].look;

    job.current = 'Assembling';
    if (coverJob) {
      const cover = await coverJob;
      if (cover.pdf) await appendPdf(doc, cover.pdf, { look: cover.look, fit: true });
      else job.skipped.push({ title: 'Cover', url: job.coverUrl, reason: cover.skipped });
    }

    // Content sheets are numbered from 1; work out each page's first number before printing the contents.
    const contentDoc = await newDocument();
    let number = 1;
    for (const p of printed) {
      p.firstNumber = number;
      number += await appendPdf(contentDoc.doc, p.bytes, { look: p.look, firstNumber: number, font: contentDoc.font });
    }
    if (job.toc) {
      job.current = 'Contents';
      const entries = printed.map(p => ({ title: p.entry.title, depth: p.entry.depth || 0, pageNumber: p.firstNumber }));
      const tab = await styleTab;
      if (tab) await appendPdf(doc, await renderContents(tab, entries, firstLook), { look: firstLook });
      else job.skipped.push({ title: 'Contents', url: job.pages[0].url, reason: 'the contents page could not be printed' });
    }
    const copied = await doc.copyPages(contentDoc.doc, contentDoc.doc.getPageIndices());
    copied.forEach(s => doc.addPage(s));
    doc.setTitle(job.fileName);

    const pdfBytes = await doc.save();
    const zip = new JSZip();
    zip.file(`${job.fileName}.pdf`, pdfBytes);
    if (job.skipped.length) {
      zip.file('skipped-pages.txt', job.skipped.map(s => `${s.title || ''}\t${s.url}\t${s.reason}`).join('\n') + '\n');
    }
    fs.mkdirSync(FILE_DIR, { recursive: true });
    job.file = path.join(FILE_DIR, `${job.id}.zip`);
    fs.writeFileSync(job.file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    job.current = null;
    finish(job, 'done');
  } finally {
    await browser.close().catch(() => {});
  }
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    if (job.state !== 'queued') continue;
    running++;
    job.state = 'running';
    job.startedAt = Date.now();
    run(job)
      .catch(e => { console.error('[pdf] export failed', e); if (job.state === 'running') finish(job, 'failed', e.message); })
      .finally(() => { running--; pump(); });
  }
}

// The headless browser runs inside the server's network, so a page host that resolves to a private,
// loopback or link-local address is refused: otherwise anyone could have the server print its own
// internal services. Local development (sites on localhost) sets DMS_PDF_ALLOW_PRIVATE=1.
const PRIVATE_V4 = [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16], ['0.0.0.0', 8], ['100.64.0.0', 10]];
const v4ToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + +o, 0) >>> 0;
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some(([base, bits]) => (v4ToInt(ip) >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}
async function checkHost(hostname) {
  if (process.env.DMS_PDF_ALLOW_PRIVATE === '1') return null;
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map(a => a.address);
  if (!addresses.length) return `cannot resolve ${hostname}`;
  if (addresses.some(isPrivateAddress)) return `${hostname} is a private address, and this server only prints public sites. A development server can allow it with DMS_PDF_ALLOW_PRIVATE=1.`;
  return null;
}

// Every page and the cover must be http(s) on one origin, and that origin must be the one the request
// came from when the browser says (Origin header).
function validate(body, origin) {
  const pages = Array.isArray(body?.pages) ? body.pages : [];
  if (!pages.length) return 'pages is required';
  if (pages.length > MAX_PAGES) return `at most ${MAX_PAGES} pages`;
  const urls = [...pages.map(p => p?.url), ...(body.cover_url ? [body.cover_url] : [])];
  let pageOrigin = null;
  for (const u of urls) {
    let parsed;
    try { parsed = new URL(u); } catch { return `not a URL: ${u}`; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return `not an http(s) URL: ${u}`;
    pageOrigin ??= parsed.origin;
    if (parsed.origin !== pageOrigin) return 'all pages must be on one site';
  }
  if (origin && origin !== 'null' && origin !== pageOrigin) return 'pages must be on the site the request comes from';
  return null;
}

function registerPdfRoutes(app) {
  app.post('/pdf/export', async (req, res) => {
    const body = req.body || {};
    const err = validate(body, req.headers.origin) || await checkHost(new URL(body.pages[0].url).hostname);
    if (err) return res.status(400).json({ error: err });

    const mode = body.mode === 'self' ? 'self' : 'public';
    const raw = req.headers.authorization || '';
    const token = mode === 'self' ? (raw.startsWith('Bearer ') ? raw.slice(7) : raw) || null : null;
    const job = {
      id: crypto.randomUUID(),
      state: 'queued',
      mode,
      token,
      pages: body.pages.map(p => ({ url: p.url, title: `${p.title ?? ''}`.trim(), depth: Math.max(0, Math.min(6, +p.depth || 0)) })),
      coverUrl: body.cover_url || null,
      toc: !!body.toc,
      fileName: safeName(body.file_name),
      done: 0,
      total: body.pages.length,
      current: null,
      skipped: [],
      timedOut: [],
      error: null,
      createdAt: Date.now(),
    };
    jobs.set(job.id, job);
    queue.push(job);
    pump();
    res.status(202).json({ id: job.id, ...status(job) });
  });

  app.get('/pdf/export/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such export' });
    res.json({ ...status(job), queuedAhead: job.state === 'queued' ? queue.indexOf(job) : 0 });
  });

  app.get('/pdf/export/:id/file', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.state !== 'done' || !job.file) return res.status(404).json({ error: 'no such file' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}.zip"`);
    res.sendFile(job.file);
  });

  app.delete('/pdf/export/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such export' });
    if (['queued', 'running'].includes(job.state)) finish(job, 'cancelled');
    res.json(status(job));
  });
}

module.exports = { registerPdfRoutes, validate, isPrivateAddress };
