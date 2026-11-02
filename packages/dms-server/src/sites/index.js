/**
 * Site hosting: serve several sites' built client files from this one server,
 * picking the site from the request's Host. index.js registers this ahead of
 * every API route, so a site request never reaches them, and points it at the
 * "<checkout>-sites" folder next to the app checkout. A missing folder means no
 * sites: every request passes through untouched.
 *
 * Layout, written by the deploy tooling and only read here:
 *
 *   <sitesDir>/<site>/site.json                   {"hosts": [...], "live": "<build id>"}
 *   <sitesDir>/<site>/previews.json               optional, see below
 *   <sitesDir>/<site>/builds/<build id>/client/   index.html, assets/, public files, _redirects
 *
 * Hosts match exactly, or through a "*.example.org" wildcard (any subdomain,
 * not the bare domain). The longest matching wildcard wins. A trailing
 * ".localhost" is ignored, so a laptop can open "www.example.org.localhost" and
 * reach the site serving "www.example.org" with no DNS changes. site.json and
 * previews.json are re-read when they change (checked at most once per
 * reloadIntervalMs), so switching a build needs no restart.
 *
 * previews.json names preview slots: hosts that serve a build other than the
 * live one, until it expires.
 *
 *   {"<slot>": {"hosts": [...], "build": "<build id>" | null, "expiresAt": "<ISO>" | null,
 *               "redirects": ["<_redirects line>", ...]}}
 *
 * A slot's hosts are claimed even while it's empty or expired, and then answer
 * a 404 line, so a slot host never falls through to the site's own wildcard
 * and its live build. A slot's redirects apply before its build, even when it
 * has none. Other fields (who holds the slot, why) are the deploy tool's.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');

// Site folder and build id names: no slashes, no leading dot, so neither can
// point outside the sites folder.
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

// Anti-clickjacking and related hardening, sent with every site response.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Vite's hashed output: a changed file gets a new name, so these never go stale.
const IMMUTABLE = 'public, max-age=31536000, immutable';

function normalizeHost(raw) {
  let host = String(raw || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (host.endsWith('.localhost')) host = host.slice(0, -'.localhost'.length);
  return host;
}

/**
 * Netlify-style `_redirects`, the subset a static SPA build uses: 3xx rules
 * whose `from` is a path (`/old`, `/old/*`) or a full URL naming a host
 * (`https://old.example.org/*`, `https://old.example.org/`). `:splat` in the
 * target takes what `*` matched. A rule ending in `!` applies even when a file
 * exists at that path; one without it only when no file does. 200 rewrites are
 * skipped: static files plus the index.html fallback already cover them.
 */
function parseRedirects(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, statusRaw = '301'] = line.split(/\s+/);
    if (!from || !to) continue;
    const status = parseInt(statusRaw, 10);
    if (!(status >= 300 && status < 400)) continue;

    let host = null;
    let fromPath = from;
    const url = from.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
    if (url) {
      host = normalizeHost(url[1]);
      fromPath = url[2] || '/';
    } else if (!from.startsWith('/')) {
      continue;
    }
    const splat = fromPath.endsWith('/*');
    rules.push({
      host,
      base: splat ? fromPath.slice(0, -2) : trimSlash(fromPath),
      splat,
      to,
      status,
      force: statusRaw.endsWith('!'),
    });
  }
  return rules;
}

function trimSlash(p) {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

function findRedirect(rules, host, pathname) {
  for (const rule of rules) {
    if (rule.host && rule.host !== host) continue;
    let splat = null;
    if (rule.splat) {
      if (pathname === rule.base || pathname === `${rule.base}/`) splat = '';
      else if (pathname.startsWith(`${rule.base}/`)) splat = pathname.slice(rule.base.length + 1);
      else continue;
    } else if (trimSlash(pathname) !== rule.base) {
      continue;
    }
    return { rule, splat };
  }
  return null;
}

function redirectTarget({ rule, splat }, search) {
  const target = rule.to.replace(/:splat/g, splat || '');
  return search && !target.includes('?') ? `${target}${search}` : target;
}

// Changes when the deploy tool replaces the file (temp file + rename) or edits it in place.
function fileStamp(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

function formatDate(ms) {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function createSitesMiddleware({ sitesDir, reloadIntervalMs = 1000 } = {}) {
  if (!sitesDir) throw new Error('createSitesMiddleware: sitesDir is required');
  sitesDir = path.resolve(sitesDir);

  let lastCheck = -Infinity;
  let sites = new Map();       // site name -> { stamp, hosts, live, previewsStamp, slots: Map(slot -> { hosts, build, expiresAt, redirects }) }
  let exactHosts = new Map();  // host -> { id, name, slot? }
  let wildcards = [];          // [{ suffix: '.example.org', target }], longest suffix first
  const builds = new Map();    // client dir -> { serveStatic, forced/soft redirects, indexPath } (builds never change)
  let unreadableLogged = false;

  function readSite(name, file, stamp, prev) {
    try {
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      const hosts = (Array.isArray(config.hosts) ? config.hosts : [])
        .filter(h => typeof h === 'string' && h.trim())
        .map(h => normalizeHost(h.trim()));
      const live = typeof config.live === 'string' && NAME_RE.test(config.live) ? config.live : null;
      if (config.live && !live) console.warn(`[sites] ${name}: ignoring live build "${config.live}" (not a plain folder name)`);
      return { stamp, hosts, live };
    } catch (err) {
      console.warn(`[sites] ${name}: can't read site.json (${err.message})${prev ? '; keeping the previous version' : ''}`);
      return prev ? { ...prev, stamp } : null;
    }
  }

  function readPreviews(name, file, prev) {
    let config;
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('not an object');
    } catch (err) {
      if (err.code === 'ENOENT') return new Map();
      console.warn(`[sites] ${name}: can't read previews.json (${err.message})${prev ? '; keeping the previous version' : ''}`);
      return prev ? prev.slots : new Map();
    }
    const slots = new Map();
    for (const [slot, entry] of Object.entries(config)) {
      if (!NAME_RE.test(slot) || !entry || typeof entry !== 'object') {
        console.warn(`[sites] ${name}: ignoring preview slot "${slot}"`);
        continue;
      }
      const hosts = (Array.isArray(entry.hosts) ? entry.hosts : [])
        .filter(h => typeof h === 'string' && h.trim())
        .map(h => normalizeHost(h.trim()));
      let build = typeof entry.build === 'string' && NAME_RE.test(entry.build) ? entry.build : null;
      if (entry.build && !build) console.warn(`[sites] ${name}/${slot}: ignoring build "${entry.build}" (not a plain folder name)`);
      let expiresAt = null;
      if (entry.expiresAt != null) {
        expiresAt = Date.parse(entry.expiresAt);
        // A slot that can't say when it expires is served as empty, never indefinitely.
        if (Number.isNaN(expiresAt)) {
          console.warn(`[sites] ${name}/${slot}: can't read expiresAt "${entry.expiresAt}"; serving the slot as empty`);
          build = null;
          expiresAt = null;
        }
      }
      const redirects = parseRedirects((Array.isArray(entry.redirects) ? entry.redirects : []).join('\n'));
      slots.set(slot, { hosts, build, expiresAt, redirects });
    }
    return slots;
  }

  function rebuildHostIndex() {
    const exact = new Map();
    const wild = new Map();
    const conflicts = new Map(); // host -> whether a preview slot claims it
    const claim = (host, target) => {
      const isWild = host.startsWith('*.');
      const key = isWild ? host.slice(1) : host;
      const index = isWild ? wild : exact;
      const held = index.get(key);
      if (!held) index.set(key, target);
      else if (held.id !== target.id) conflicts.set(host, conflicts.get(host) || !!held.slot || !!target.slot);
    };
    for (const [name, site] of sites) {
      for (const host of site.hosts) claim(host, { id: name, name });
      for (const [slot, { hosts }] of site.slots) {
        for (const host of hosts) claim(host, { id: `${name}/${slot}`, name, slot });
      }
    }
    for (const [host, slotClaimed] of conflicts) {
      const isWild = host.startsWith('*.');
      const index = isWild ? wild : exact;
      const key = isWild ? host.slice(1) : host;
      // A site host claimed twice falls through. A slot host can't: a shorter wildcard would serve a live build.
      if (slotClaimed) index.set(key, { id: 'conflict', conflict: true });
      else index.delete(key);
      console.warn(`[sites] ${host} is claimed more than once; serving it from none`);
    }
    exactHosts = exact;
    wildcards = [...wild].map(([suffix, target]) => ({ suffix, target }))
      .sort((a, b) => b.suffix.length - a.suffix.length);

    const servedDirs = new Set();
    for (const [name, site] of sites) {
      if (site.live) servedDirs.add(clientDir(name, site.live));
      console.log(`[sites] ${name}: ${site.hosts.join(', ') || '(no hosts)'} -> build ${site.live || '(none)'}`);
      for (const [slot, { hosts, build, expiresAt }] of site.slots) {
        if (build) servedDirs.add(clientDir(name, build));
        const until = build && expiresAt !== null ? ` until ${formatDate(expiresAt)}` : '';
        console.log(`[sites] ${name}/${slot}: ${hosts.join(', ') || '(no hosts)'} -> build ${build || '(empty)'}${until}`);
      }
    }
    for (const dir of builds.keys()) if (!servedDirs.has(dir)) builds.delete(dir);
  }

  function refresh() {
    const now = Date.now();
    if (now - lastCheck < reloadIntervalMs) return;
    lastCheck = now;

    let names = [];
    try {
      names = fs.readdirSync(sitesDir);
      unreadableLogged = false;
    } catch (err) {
      // No folder is the normal case on a server that hosts no sites.
      if (err.code !== 'ENOENT' && !unreadableLogged) console.warn(`[sites] can't read ${sitesDir} (${err.message}); no sites served`);
      unreadableLogged = true;
    }

    let changed = false;
    const next = new Map();
    for (const name of names) {
      if (!NAME_RE.test(name)) continue;
      const file = path.join(sitesDir, name, 'site.json');
      const previewsFile = path.join(sitesDir, name, 'previews.json');
      const stamp = fileStamp(file);
      if (!stamp) continue;
      const previewsStamp = fileStamp(previewsFile);
      const prev = sites.get(name);
      if (prev && prev.stamp === stamp && prev.previewsStamp === previewsStamp) {
        next.set(name, prev);
        continue;
      }
      changed = true;
      const site = prev && prev.stamp === stamp ? prev : readSite(name, file, stamp, prev);
      if (!site) continue;
      const slots = prev && prev.previewsStamp === previewsStamp ? prev.slots : readPreviews(name, previewsFile, prev);
      next.set(name, { ...site, previewsStamp, slots });
    }
    for (const name of sites.keys()) if (!next.has(name)) changed = true;
    sites = next;
    if (changed) rebuildHostIndex();
  }

  function clientDir(name, build) {
    return path.join(sitesDir, name, 'builds', build, 'client');
  }

  function resolveSite(host) {
    const target = exactHosts.get(host)
      || wildcards.find(w => host.endsWith(w.suffix))?.target;
    if (!target || target.conflict) return target || null;
    const site = sites.get(target.name);
    return { name: target.name, site, slot: target.slot && site.slots.get(target.slot) };
  }

  function loadBuild(dir) {
    if (builds.has(dir)) return builds.get(dir);
    const indexPath = path.join(dir, 'index.html');
    if (!fs.existsSync(indexPath)) return null;
    let redirects = [];
    try {
      redirects = parseRedirects(fs.readFileSync(path.join(dir, '_redirects'), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[sites] can't read ${dir}/_redirects (${err.message})`);
    }
    const build = {
      indexPath,
      forcedRedirects: redirects.filter(r => r.force),
      softRedirects: redirects.filter(r => !r.force),
      serveStatic: express.static(dir, {
        index: false,
        redirect: false,
        cacheControl: false,
        setHeaders(res, filePath) {
          const rel = path.relative(dir, filePath);
          res.setHeader('Cache-Control', rel.startsWith(`assets${path.sep}`) ? IMMUTABLE : 'no-cache');
        },
      }),
    };
    builds.set(dir, build);
    return build;
  }

  return function sitesMiddleware(req, res, next) {
    refresh();
    const host = normalizeHost(req.headers.host);
    const match = resolveSite(host);
    if (!match) return next();

    res.set(SECURITY_HEADERS);
    if (match.conflict) {
      return res.status(404).type('text/plain').send('This preview address is claimed twice. See the server log.');
    }

    const pathname = req.path;
    const q = req.originalUrl.indexOf('?');
    const search = q === -1 ? '' : req.originalUrl.slice(q);

    const { slot } = match;
    if (slot) {
      const redirect = findRedirect(slot.redirects, host, pathname);
      if (redirect) return res.redirect(redirect.rule.status, redirectTarget(redirect, search));
      if (!slot.build) return res.status(404).type('text/plain').send('This preview slot is empty.');
      if (slot.expiresAt !== null && Date.now() >= slot.expiresAt) {
        return res.status(404).type('text/plain').send(`This preview expired on ${formatDate(slot.expiresAt)}.`);
      }
    }

    const buildId = slot ? slot.build : match.site.live;
    const build = buildId ? loadBuild(clientDir(match.name, buildId)) : null;
    // Which build answered: the deploy tooling checks it after publishing, and it tells anyone debugging
    // what they're looking at. Builds of the same commits have identical files, so the files can't say.
    if (build) res.set('X-Site-Build', buildId);
    if (!build) {
      if (slot) return res.status(404).type('text/plain').send("This preview's build is no longer on the server.");
      return res.status(503).type('text/plain').send('This site has no live build.');
    }

    const forced = findRedirect(build.forcedRedirects, host, pathname);
    if (forced) return res.redirect(forced.rule.status, redirectTarget(forced, search));

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).set('Allow', 'GET, HEAD').type('text/plain').send('Method Not Allowed');
    }

    const afterStatic = () => {
      const soft = findRedirect(build.softRedirects, host, pathname);
      if (soft) return res.redirect(soft.rule.status, redirectTarget(soft, search));
      // A missing hashed chunk is a real 404: answering with HTML would only
      // surface as a confusing module/MIME error in the browser.
      if (pathname.startsWith('/assets/')) return res.status(404).type('text/plain').send('Not Found');
      res.set('Cache-Control', 'no-cache');
      res.sendFile(build.indexPath, { cacheControl: false }, err => {
        if (err && !res.headersSent) res.status(err.status || 500).end();
      });
    };

    // The build's own _redirects file is config, not content.
    if (pathname === '/_redirects') return afterStatic();
    build.serveStatic(req, res, afterStatic);
  };
}

module.exports = { createSitesMiddleware, parseRedirects, normalizeHost };
