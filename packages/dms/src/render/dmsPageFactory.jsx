import React, { useEffect } from "react";
import { useParams, useLocation, useNavigate, useLoaderData, useRevalidator } from "react-router";

import { dmsDataLoader, dmsDataEditor } from "../api";

import DmsManager from "../dms-manager/index.jsx";
import { withAuth } from "../patterns/auth/providers";
import { useAuth } from "../patterns/auth/context";
// import defaultTheme from './theme/default-theme'

import { falcorGraph, FalcorProvider } from "@availabs/avl-falcor";
//const noAuth = Component => Component

export default function dmsPageFactory({
  dmsConfig,
  API_HOST = "https://graph.availabs.org",
  DAMA_HOST = "https://graph.availabs.org",
  authWrapper = withAuth,
  ErrorBoundary,
  isAuth,
}) {
  let { baseUrl = "", errorElement } = dmsConfig;
  const ErrorBoundaryComp = errorElement || ErrorBoundary;
  const dmsPath = `${baseUrl}${baseUrl === "/" ? "" : "/"}`;
  // console.log('dmspageFactory', API_HOST)
  const falcor = falcorGraph(API_HOST);
  // Tracks the login token across loader calls so the no-access retry below
  // can tell "user just logged in, cache is stale" apart from "this visitor
  // genuinely can't see this content" — see that check for why the distinction
  // matters. Read once at module init; on the server (no `window`) this stays
  // null forever, which correctly disables the retry for SSR requests.
  let lastAuthToken = typeof window !== 'undefined' ? window.localStorage?.getItem('userToken') : null;
  // Separate one-shot memory for DMS()'s revalidate-on-auth-resolve effect
  // below — closure-scoped (not a useRef) so it survives a remount, not just
  // a re-render. A useRef here would reset on every fresh mount, and if
  // whatever's on screen for a persistently (correctly, permanently) denied
  // user ever forces a remount for an unrelated reason, a per-mount guard
  // would let the effect re-fire forever — one real remount loop is enough
  // to turn a single intended retry into an infinite one, since the
  // underlying fact ("this user has no access") never changes between
  // attempts. Tracked separately from `lastAuthToken` above: that one gates
  // the loader's own cache-resync retry, this one gates a full route
  // revalidate from the rendered component — different layers, don't share.
  let lastRevalidateAttemptToken;

  async function loader({ request, params }) {
    if (isAuth) return { data: [] };
    const path = `/${params["*"] || ""}`;
    // if (import.meta.env.DEV) console.log(`[dms loader] ${path} — start`)
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params["*"] || ""}`);
    // A blocked row comes back from the server with every field (including
    // `id`) scrubbed to the literal string 'no-access' — including rows
    // pulled in only for site-nav purposes, unrelated to the page actually
    // being viewed. So `data.some(d => d.id === 'no-access')` is true on
    // almost any anonymous load of a site that restricts *any* nav page,
    // regardless of whether the current page itself is restricted. Retrying
    // only helps the one real scenario this guards against — a user who just
    // logged in while the Falcor cache still holds pre-login 'no-access'
    // responses — so only retry when the auth token has actually changed
    // since the last *successful resync*. Only advance `lastAuthToken` inside
    // the retry branch (not on every call): if we compared against "last
    // loader call" instead, a token change would get silently consumed by
    // whichever page loads first after login, even if that page had nothing
    // restricted to retry — leaving any *other* page's stale pre-login
    // no-access cache stuck with no further chance to self-heal this session.
    const currentAuthToken = typeof window !== 'undefined' ? window.localStorage?.getItem('userToken') : null;
    if (currentAuthToken !== lastAuthToken) {
      // `falcor.setCache({})` used to wipe the entire root cache here — every
      // pattern, every site visited this session, not just the blocked rows —
      // forcing a full re-fetch storm on the very next render even though only
      // this page's pattern(s) actually had stale pre-login data. Scope the
      // invalidate to just the app+type pairs seen among the blocked rows
      // instead. `app`/`type` are real values even on a blocked row (only the
      // other fields get scrubbed to 'no-access' — see dms-server's
      // dms.route.js); the real per-row id is not (discarded by
      // processNewData's Object.values flatten), so this is pattern-level
      // scoping, not per-row.
      const blocked = data.filter(d => d.id === 'no-access');
      if (blocked.length) {
        const paths = [...new Set(blocked.map(d => `${d.app}+${d.type}`))]
          .map(appType => ['dms', 'data', appType]);
        await falcor.invalidate(...paths);
        data = await dmsDataLoader(falcor, dmsConfig, `/${params["*"] || ""}`);
        lastAuthToken = currentAuthToken;
      }
    }
    const t1 = import.meta.env.DEV ? performance.now() : 0;
    // Pre-load dataWrapper section data if the pattern supports it
    if (dmsConfig.preload) {
      data = await dmsConfig.preload(falcor, data, request, params);
    }
    if (import.meta.env.DEV) {
      const t2 = performance.now();
      //console.log('[dms loader]', data)
      // console.log(
      //   `[dms loader] ${path} — data: ${(t1 - t0).toFixed(0)}ms, preload: ${(t2 - t1).toFixed(0)}ms, total: ${(t2 - t0).toFixed(0)}ms`
      // )
    }
    return {
      data,
    };
  }

  async function action({ request, params }) {
    if (isAuth) return;
    const form = await request.formData();
    return dmsDataEditor(
      falcor,
      dmsConfig,
      JSON.parse(form.get("data")),
      form.get("requestType"),
      params["*"],
    );
  }

  function DMS() {
    const params = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const AuthedManager = React.useMemo(() => authWrapper(DmsManager), []);
    const { user } = useAuth();
    const loaderData = useLoaderData();
    const revalidator = useRevalidator();

    // SSR always renders as anonymous — the server never sees a browser's
    // localStorage token (see the loader's comment above) — and client
    // hydration reuses that server-rendered loader data as-is, without
    // re-running the loader. So a genuinely authorized, already-logged-in
    // user hard-navigating straight to a restricted page gets stuck seeing
    // the SSR "no-access" render forever: nothing else re-asks the server
    // now that the real token is available. Once AuthProvider has actually
    // confirmed (not just optimistically assumed — hence waiting out
    // isAuthenticating) a real authenticated user, if the page we already
    // rendered is a no-access stub, revalidate once so the loader reruns
    // with the now-known-good auth. Gated on `lastRevalidateAttemptToken`
    // (declared above, outside this component) rather than a useRef: only
    // ever needs to fire once per auth token, and a closure variable is what
    // makes that hold across a remount, not just across re-renders of the
    // same mounted instance.
    useEffect(() => {
      const hasNoAccess = loaderData?.data?.some(d => d?.id === 'no-access');
      const currentToken = typeof window !== 'undefined' ? window.localStorage?.getItem('userToken') : null;
      if (user?.authed && !user?.isAuthenticating && hasNoAccess && currentToken !== lastRevalidateAttemptToken) {
        lastRevalidateAttemptToken = currentToken;
        revalidator.revalidate();
      }
    }, [user?.authed, user?.isAuthenticating, loaderData, revalidator]);

    return React.useMemo(
      () => (
        <FalcorProvider falcor={falcor}>
          <AuthedManager
            path={`/${params["*"] || ""}`}
            baseUrl={baseUrl}
            config={dmsConfig}
            navigate={navigate}
            falcor={falcor}
          />
        </FalcorProvider>
      ),
      [params["*"]],
    );
  }

  return {
    path: `${dmsPath}*`,
    Component: (props) => (
      <>
        <ScrollToTop />
        <ScrollToHash />
        <DMS {...props} />
      </>
    ),
    loader: loader,
    action: action,
    // Skip the loader re-run (and the tree remount it triggers) when ONLY the
    // search params changed on the same path. Those are page-variable / filter
    // navigations (e.g. a map writing `?layers=`) that the page already handles
    // in-memory — `updatePageStateFiltersOnSearchParamChange` syncs search→filters
    // and sections refetch client-side via the dataWrapper — so re-running the
    // server preload just remounts PageView for nothing (the visible "refresh").
    // Still revalidate on: cross-page navigation, mutations (non-GET), and
    // explicit `revalidate()` calls (same URL → defer to the default).
    shouldRevalidate: ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
      if (formMethod && formMethod !== "GET") return true;
      if (!currentUrl || !nextUrl) return defaultShouldRevalidate;
      if (currentUrl.pathname !== nextUrl.pathname) return true;
      if (currentUrl.search === nextUrl.search) return defaultShouldRevalidate;
      return false;
    },
    errorElement: <ErrorBoundaryComp />,
  };
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const getAbsoluteTop = (el) => {
  let top = 0;
  while (el) {
    top += el.offsetTop;
    el = el.offsetParent;
  }
  return top;
};

function ScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    let rafId;

    const scrollWhenStable = (el) => {
      let prev = getAbsoluteTop(el);
      let stable = 0;
      let attempts = 0;

      const tick = () => {
        const top = getAbsoluteTop(el);
        stable = top === prev ? stable + 1 : 0;
        prev = top;
        attempts++;

        if (stable >= 2 || attempts >= 30) {
          window.scrollTo({ top: prev - 170, behavior: "smooth" });
          return;
        }
        // fast rAF checks first (~16ms each), then slower polling
        rafId =
          attempts < 10 ? requestAnimationFrame(tick) : setTimeout(tick, 100);
      };

      rafId = requestAnimationFrame(tick);
    };

    const el = document.getElementById(id);
    if (el) {
      scrollWhenStable(el);
      return () => {
        clearTimeout(rafId);
        cancelAnimationFrame(rafId);
      };
    }

    const observer = new MutationObserver(() => {
      const el = document.getElementById(id);
      if (el) {
        observer.disconnect();
        clearTimeout(giveUp);
        scrollWhenStable(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const giveUp = setTimeout(() => observer.disconnect(), 5000);

    return () => {
      observer.disconnect();
      clearTimeout(giveUp);
      clearTimeout(rafId);
      cancelAnimationFrame(rafId);
    };
  }, [hash]);
  return null;
}
