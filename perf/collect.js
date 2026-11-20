// The in-page collector. `collector` runs in the browser before any page script (Playwright
// addInitScript), so it must be self-contained: no imports, no closure over this module.
//
// It records the standard paint and layout entries, and tracks two kinds of ACTIVITY:
//   visible   the page the visitor sees is still arriving:
//               - something in the DOM carries `data-dms-loading` (the client's loading contract: a
//                 section sets it while its data request is out; dms-server's PDF renderer waits on
//                 the same attribute)
//               - nodes were added or removed
//               - an image, stylesheet, script or font finished loading
//   any       the above, plus work the visitor doesn't see: a fetch or XHR in flight (sync's bootstrap,
//             a prefetch), a write to IndexedDB (sync saving its copy), a long task
// The runner waits until ALL activity has been quiet for a while. It then reports two times:
//   complete  the last VISIBLE activity: the page is all there
//   idle      the last activity of any kind: the browser has nothing left to do
// A WebSocket staying open is not activity (sync keeps one for the life of the page). A canvas that
// repaints without touching the DOM (a map) is invisible to this: it needs the loading contract.
export function collector() {
  if (window.__dmsPerf) return;
  const now = () => performance.now();
  const P = window.__dmsPerf = {
    paints: {}, lcp: null, cls: 0, longTasks: [], softNavs: [], marks: [],
    inflight: 0, lastActivity: 0, lastVisible: 0, lastClick: null, urlChanges: [],
    loadingSeen: false, last: {}, res: [], loadingEls: new Set(),
  };
  // `kind` says what was active; the last time of each kind is kept, to explain a slow page
  const touch = (kind, visible, t) => {
    const v = t ?? now();
    if (v > P.lastActivity) P.lastActivity = v;
    if (visible && v > P.lastVisible) P.lastVisible = v;
    if (!(P.last[kind] > v)) P.last[kind] = v;
  };

  const observe = (type, fn, extra = {}) => {
    try { new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); }
    catch { /* entry type not supported in this browser */ }
  };
  observe('paint', (e) => { P.paints[e.name] = e.startTime; });
  observe('largest-contentful-paint', (e) => {
    P.lcp = { time: e.startTime, size: e.size, tag: e.element?.tagName || null, url: e.url || null };
  });
  observe('layout-shift', (e) => { if (!e.hadRecentInput) P.cls += e.value; });
  observe('longtask', (e) => { P.longTasks.push([e.startTime, e.duration]); touch('longtask', false, e.startTime + e.duration); });
  observe('resource', (e) => {
    const data = e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'beacon';
    touch(data ? 'fetch' : 'resource', !data, e.responseEnd || e.startTime);
    // 2: a component's data (dataset rows: Falcor's uda / dama routes); 1: other data (the page's own
    // content, sync, tracking); 0: a file
    let kind = 0;
    if (data) { let u = e.name; try { u = decodeURIComponent(u); } catch { /* keep it raw */ } kind = /\[\s*"(uda|dama)"/.test(u) ? 2 : 1; }
    P.res.push([e.startTime, e.responseEnd || e.startTime, kind]);
  });
  observe('mark', (e) => { if (e.name.startsWith('dms:')) P.marks.push([e.name, e.startTime]); });
  // Chrome 151+ (or --enable-features=SoftNavigationHeuristics): paints for an in-app navigation
  observe('soft-navigation', (e) => {
    P.softNavs.push({ start: e.startTime, url: e.name, fcp: e.paintTime ?? e.presentationTime ?? null, lcp: null });
  });
  observe('interaction-contentful-paint', (e) => {
    const nav = P.softNavs[P.softNavs.length - 1];
    // the entry starts at the interaction; when it painted is in its paint fields
    const painted = e.renderTime || e.paintTime || e.presentationTime || e.loadTime || null;
    if (nav && painted && painted > nav.start) nav.lcp = painted;
  });

  // requests the page makes itself
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (...args) {
      P.inflight++; touch('fetch', false);
      const done = () => { P.inflight--; touch('fetch', false); };
      let p;
      try { p = origFetch.apply(this, args); } catch (e) { done(); throw e; }
      // the request is over when its body has arrived, not when its headers have: a large response
      // (sync's bootstrap) is still downloading long after fetch() resolves
      p.then((res) => { try { res.clone().arrayBuffer().then(done, done); } catch { done(); } }, done);
      return p;
    };
  }
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const send = XHR.prototype.send;
    XHR.prototype.send = function (...args) {
      P.inflight++; touch('fetch', false);
      this.addEventListener('loadend', () => { P.inflight--; touch('fetch', false); }, { once: true });
      return send.apply(this, args);
    };
  }

  // writes to the browser's own database (sync saving its copy of the site): work the visitor
  // doesn't see, and the page isn't done while one is open
  const IDB = window.IDBDatabase;
  if (IDB) {
    const transaction = IDB.prototype.transaction;
    IDB.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (tx.mode !== 'readonly') {
        P.inflight++; touch('storage', false);
        let open = true;
        const done = () => { if (open) { open = false; P.inflight--; touch('storage', false); } };
        tx.addEventListener('complete', done); tx.addEventListener('abort', done); tx.addEventListener('error', done);
      }
      return tx;
    };
  }

  // the loading contract, and the DOM still changing
  const loadingCount = () => document.querySelectorAll('[data-dms-loading]').length;
  const startDomWatch = () => {
    new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length))) touch('dom', true);
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) startDomWatch(); else document.addEventListener('readystatechange', startDomWatch, { once: true });

  // an in-app navigation: when the click happened, and when the URL changed
  window.addEventListener('click', () => { P.lastClick = now(); }, true);
  for (const name of ['pushState', 'replaceState']) {
    const orig = history[name];
    history[name] = function (...args) {
      const r = orig.apply(this, args);
      P.urlChanges.push([now(), location.pathname + location.search]); touch('url', true);
      return r;
    };
  }
  window.addEventListener('popstate', () => { P.urlChanges.push([now(), location.pathname + location.search]); touch('url', true); });

  // Resolves when the page has been quiet for `quietMs`, with the time the visible page was last
  // active (`complete`) and the time anything was (`idle`), in ms on this document's clock. `since`: activity before it doesn't count (an in-app click on a page that was
  // already complete). Gives up at `timeoutMs` and says so.
  P.waitComplete = ({ quietMs = 500, timeoutMs = 60000, since = 0 } = {}) => new Promise((resolve) => {
    const started = now();
    const tick = () => {
      const loading = loadingCount();
      if (loading > 0) { P.loadingSeen = true; touch('loading', true); document.querySelectorAll('[data-dms-loading]').forEach((el) => P.loadingEls.add(el)); }
      if (document.readyState !== 'complete') touch('document', true);
      if (P.inflight > 0) touch('busy', false);
      const busy = P.inflight > 0 || loading > 0 || document.readyState !== 'complete';
      const t = now();
      const idle = Math.max(P.lastActivity, since);
      const result = () => ({ complete: Math.max(P.lastVisible, since), idle, last: { ...P.last } });
      if (!busy && t - idle >= quietMs) return resolve({ ...result(), timedOut: false });
      if (t - started >= timeoutMs) return resolve({ ...result(), idle: t, timedOut: true, inflight: P.inflight, loading });
      setTimeout(tick, 50);
    };
    tick();
  });

  // Where the time between `since` and `until` went. Every millisecond gets one label, the first that
  // applies: server (before the document's first byte), script (a main-thread task over 50 ms: the page
  // is frozen), cdata (a component's data request in flight), data (any other data request in flight),
  // files (the document, an image, script, stylesheet or font downloading), other (short tasks, layout,
  // paint, timers).
  P.phases = (since, until) => {
    const cats = ['server', 'script', 'cdata', 'data', 'files'];
    const nav = performance.getEntriesByType('navigation')[0];
    const iv = [
      since === 0 && nav ? [[0, nav.responseStart]] : [],
      P.longTasks.map(([s, d]) => [s, s + d]),
      P.res.filter((r) => r[2] === 2).map((r) => [r[0], r[1]]),
      P.res.filter((r) => r[2] === 1).map((r) => [r[0], r[1]]),
      P.res.filter((r) => !r[2]).map((r) => [r[0], r[1]]).concat(since === 0 && nav ? [[nav.responseStart, nav.responseEnd]] : []),
    ];
    const ev = [];
    iv.forEach((list, ci) => list.forEach(([a, b]) => {
      a = Math.max(a, since); b = Math.min(b, until);
      if (b > a) { ev.push([a, ci, 1]); ev.push([b, ci, -1]); }
    }));
    ev.sort((x, y) => x[0] - y[0]);
    const open = [0, 0, 0, 0, 0], out = { server: 0, script: 0, cdata: 0, data: 0, files: 0, other: 0 };
    let t = since;
    for (const [at, ci, d] of ev) {
      if (at > t) { const k = open.findIndex((n) => n > 0); out[k < 0 ? 'other' : cats[k]] += at - t; t = at; }
      open[ci] += d;
    }
    if (until > t) out.other += until - t;
    return out;
  };
  // When the page can be used: from `from` (the main content's paint), the first moment with no
  // main-thread task over 50 ms running and none starting in the next second.
  P.usable = (from) => {
    let t = from;
    for (const [s, d] of P.longTasks.slice().sort((a, b) => a[0] - b[0])) {
      if (s + d <= t) continue;
      if (s - t >= 1000) break;
      t = s + d;
    }
    return t;
  };

  // What the runner reads once the page is complete.
  P.read = (since = 0) => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = P.paints['first-contentful-paint'] ?? null;
    const tasks = P.longTasks.filter(([s]) => s >= since);
    return {
      ttfb: nav ? nav.responseStart : null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
      load: nav ? nav.loadEventEnd : null,
      docTransfer: nav ? nav.transferSize : null,
      docDecoded: nav ? nav.decodedBodySize : null,
      serverTiming: nav ? (nav.serverTiming || []).map((s) => [s.name, s.duration]) : [],
      fcp, lcp: P.lcp, cls: P.cls,
      // blocking time: the part of each long task past 50 ms, after first paint
      tbt: tasks.filter(([s]) => fcp == null || s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
      longestTask: tasks.reduce((a, [, d]) => Math.max(a, d), 0),
      marks: P.marks, softNavs: P.softNavs, urlChanges: P.urlChanges, lastClick: P.lastClick,
      loadingSeen: P.loadingSeen, loadingSections: P.loadingEls.size,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      resources: performance.getEntriesByType('resource').length,
    };
  };
}
