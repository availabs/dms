import React, {useEffect} from 'react'
import { useParams, useLocation, useNavigate } from "react-router";

import {
  dmsDataLoader,
  dmsDataEditor,
} from '../api'

import DmsManager from '../dms-manager/index.jsx'
import { withAuth } from '../patterns/auth/context';
// import defaultTheme from './theme/default-theme'

import {
  falcorGraph,
  FalcorProvider
} from "@availabs/avl-falcor"
//const noAuth = Component => Component

export default function dmsPageFactory (
  {
      dmsConfig,
      API_HOST = 'https://graph.availabs.org',
      authWrapper = withAuth,
      ErrorBoundary,
      isAuth
  }
) {
  let {
    baseUrl = "",
    errorElement
  } = dmsConfig
  const ErrorBoundaryComp = errorElement || ErrorBoundary
  const dmsPath = `${baseUrl}${baseUrl === '/' ? '' : '/'}`
  // console.log('dmspageFactory', API_HOST)
  const falcor = falcorGraph(API_HOST)

  async function loader ({ request, params }) {
    if (isAuth) return { data: [] }
    const path = `/${params['*'] || ''}`
    if (import.meta.env.DEV) console.log(`[dms loader] ${path} — start`)
    const t0 = import.meta.env.DEV ? performance.now() : 0
    let data = await dmsDataLoader(falcor, dmsConfig, `/${params['*'] || ''}`)
    const t1 = import.meta.env.DEV ? performance.now() : 0
    // Pre-load dataWrapper section data if the pattern supports it
    // if (dmsConfig.preload) {
    //   data = await dmsConfig.preload(falcor, data, request, params)
    // }
    if (import.meta.env.DEV) {
      const t2 = performance.now()
      //console.log('[dms loader]', data)
      console.log(
        `[dms loader] ${path} — data: ${(t1 - t0).toFixed(0)}ms, preload: ${(t2 - t1).toFixed(0)}ms, total: ${(t2 - t0).toFixed(0)}ms`
      )
    }
    return {
      data
    }
  }

  async function action ({ request, params }) {
      if(isAuth) return;
    const form = await request.formData();
    return dmsDataEditor(falcor,
      dmsConfig,
      JSON.parse(form.get("data")),
      form.get("requestType"),
      params['*']
    )
  };

  function DMS() {
    const params = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const AuthedManager = React.useMemo(() => authWrapper(DmsManager), [])

    return React.useMemo(() => (
      <FalcorProvider falcor={falcor}>
        <AuthedManager
          path={ `/${params['*'] || ''}` }
          baseUrl={baseUrl}
          config={dmsConfig}
          navigate={navigate}
          falcor={falcor}
        />
      </FalcorProvider>
    ),[params['*']])
  }

  return {
    path: `${dmsPath}*`,
    Component: (props) =>  (
      <>
        <ScrollToTop />
        <ScrollToHash />
        <DMS {...props} />
      </>
    ),
    loader: loader,
    action: action,
    errorElement: <ErrorBoundaryComp />
  }
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
          window.scrollTo({ top: prev - 170, behavior: 'smooth' });
          return;
        }
        // fast rAF checks first (~16ms each), then slower polling
        rafId = attempts < 10 ? requestAnimationFrame(tick) : setTimeout(tick, 100);
      };

      rafId = requestAnimationFrame(tick);
    };

    const el = document.getElementById(id);
    if (el) {
      scrollWhenStable(el);
      return () => { clearTimeout(rafId); cancelAnimationFrame(rafId); };
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

    return () => { observer.disconnect(); clearTimeout(giveUp); clearTimeout(rafId); cancelAnimationFrame(rafId); };
  }, [hash]);
  return null;
}
