// What mode the target is in. The tool never switches a site's mode: it measures the target as it is
// and records what it found, so two saved runs can be compared knowing what differed.

/** From the document's HTML as the server sent it. */
export function detectFromHtml(html = '') {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*(<script|<\/body>)/);
  const rootHasContent = /<div id="root">\s*</.test(html);
  // React Server Components (rsc-view-pages.md): the page's tree arrives a second time as the RSC payload,
  // inlined in scripts that push onto self.__FLIGHT_DATA. It is that render's hydration data, so it counts
  // as such; today's pages have none and measure as before.
  const flightBytes = [...html.matchAll(/__FLIGHT_DATA\|\|=\[\]\)\.push\(([\s\S]*?)\)<\/script>/g)].reduce((n, m) => n + m[1].length, 0);
  const rsc = html.includes('__FLIGHT_DATA');
  return {
    // server-rendered: the document arrives with the page inside #root and the SSR data script, or as RSC
    ssr: (html.includes('__dmsSSRData') || rsc) && rootHasContent,
    rsc,
    hydrationBytes: ((html.match(/__staticRouterHydrationData = JSON\.parse\((".*?")\);/s) || [])[1]?.length || 0) + flightBytes,
    // a dev server (Vite, unbundled modules): not what a visitor is served
    devBuild: html.includes('/@vite/client') || html.includes('/@react-refresh'),
    rootBytes: root ? root[1].length : null,
  };
}

/** Runs in the page, once it is complete. */
export function detectInPage() {
  let signedIn = false;
  try { signedIn = !!localStorage.getItem('userToken'); } catch { /* storage blocked */ }
  return {
    sync: !!globalThis.__dmsSyncAPI,
    signedIn,
    softNavigationSupported: (PerformanceObserver.supportedEntryTypes || []).includes('soft-navigation'),
    userAgent: navigator.userAgent,
  };
}
