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
 *   <sitesDir>/<site>/builds/<build id>/client/   index.html, assets/, public files, _redirects
 *
 * Hosts match exactly, or through a "*.example.org" wildcard (any subdomain,
 * not the bare domain). A trailing ".localhost" is ignored, so a laptop can open
 * "www.example.org.localhost" and reach the site serving "www.example.org" with
 * no DNS changes. site.json is re-read when it changes (checked at most once per
 * reloadIntervalMs), so switching a site's live build needs no restart.
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

function createSitesMiddleware({ sitesDir, reloadIntervalMs = 1000 } = {}) {
  if (!sitesDir) throw new Error('createSitesMiddleware: sitesDir is required');
  sitesDir = path.resolve(sitesDir);

  let lastCheck = -Infinity;
  let sites = new Map();       // site name -> { stamp, hosts, live }
  let exactHosts = new Map();  // host -> site name
  let wildcards = [];          // [{ suffix: '.example.org', name }], longest suffix first
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

  function rebuildHostIndex() {
    const exact = new Map();
    const wild = new Map();
    const conflicts = new Set();
    for (const [name, site] of sites) {
      for (const host of site.hosts) {
        const isWild = host.startsWith('*.');
        const key = isWild ? host.slice(1) : host;
        const index = isWild ? wild : exact;
        if (index.has(key) && index.get(key) !== name) conflicts.add(host);
        else index.set(key, name);
      }
    }
    for (const host of conflicts) {
      const isWild = host.startsWith('*.');
      (isWild ? wild : exact).delete(isWild ? host.slice(1) : host);
      console.warn(`[sites] ${host} is claimed by more than one site; serving it from none`);
    }
    exactHosts = exact;
    wildcards = [...wild].map(([suffix, name]) => ({ suffix, name }))
      .sort((a, b) => b.suffix.length - a.suffix.length);

    const liveDirs = new Set();
    for (const [name, site] of sites) {
      if (site.live) liveDirs.add(clientDir(name, site.live));
      console.log(`[sites] ${name}: ${site.hosts.join(', ') || '(no hosts)'} -> build ${site.live || '(none)'}`);
    }
    for (const dir of builds.keys()) if (!liveDirs.has(dir)) builds.delete(dir);
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
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
      const prev = sites.get(name);
      if (prev && prev.stamp === stamp) {
        next.set(name, prev);
        continue;
      }
      const site = readSite(name, file, stamp, prev);
      if (site) next.set(name, site);
      changed = true;
    }
    for (const name of sites.keys()) if (!next.has(name)) changed = true;
    sites = next;
    if (changed) rebuildHostIndex();
  }

  function clientDir(name, live) {
    return path.join(sitesDir, name, 'builds', live, 'client');
  }

  function resolveSite(host) {
    const name = exactHosts.get(host)
      || wildcards.find(w => host.endsWith(w.suffix))?.name;
    return name ? { name, site: sites.get(name) } : null;
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
    const build = match.site.live ? loadBuild(clientDir(match.name, match.site.live)) : null;
    // Which build answered: the deploy tooling checks it after publishing, and it tells anyone debugging
    // what they're looking at. Builds of the same commits have identical files, so the files can't say.
    if (build) res.set('X-Site-Build', match.site.live);
    if (!build) {
      return res.status(503).type('text/plain').send('This site has no live build.');
    }

    const pathname = req.path;
    const q = req.originalUrl.indexOf('?');
    const search = q === -1 ? '' : req.originalUrl.slice(q);
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
