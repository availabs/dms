// What mode the target is in. The tool never switches a site's mode: it measures the target as it is
// and records what it found, so two saved runs can be compared knowing what differed.

/** From the document's HTML as the server sent it. */
export function detectFromHtml(html = '') {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*(<script|<\/body>)/);
  const rootHasContent = /<div id="root">\s*</.test(html);
  return {
    // server-rendered: the document arrives with the page inside #root and the SSR data script
    ssr: html.includes('__dmsSSRData') && rootHasContent,
    hydrationBytes: (html.match(/__staticRouterHydrationData = JSON\.parse\((".*?")\);/s) || [])[1]?.length || 0,
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
