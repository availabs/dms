import React from "react";
import pageConfig from "../page/siteConfig";
import { defaultCheckAuth } from "../../dms-manager/_auth";
import { preloadSectionComponents } from "../page/components/sections/componentRegistry";
import { pageSectionTypes } from "../../api/preloadSectionData.js";
import { buildQaPages, findQaPage } from "./pages";
import QaPageView from "./pages/view";
import QaShell from "./pages/shell";
import { loadThemeFonts } from "../../ui/useTheme";
import { QA_TOKENS_FONT } from "./qa.theme";
import { registerWidget } from "../../ui/widgets";
import ReportIssue from "./reportIssue/ReportIssue";

// The "Report an issue" nav widget: a theme places it in any nav slot, like the page pattern's
// UserMenu (page/siteConfig.jsx). It shows only on pages a QA install covers.
registerWidget('ReportIssue', { label: 'Report an issue', component: ReportIssue })

// The `qa` pattern type: ticketing / delivery QA. Its pages are code (./pages),
// there is no editor, and each qa pattern row is its own install. Like every
// pattern it declares its own route list; it borrows the page pattern's context
// shell (theme, CMSContext, route auth) and page format, so sections render
// exactly as they do on a page pattern.
const qaConfig = (props) => {
  const pageCfg = pageConfig[0]({ ...props, hasEditor: false });
  // The --qa-* tokens, only on a site that has a QA install (this config runs per install). The QA
  // named styles are added where the pages render (pages/view.jsx).
  loadThemeFonts([QA_TOKENS_FONT], { ssrCollect: props.ssrCollect });
  const [shell] = pageCfg.children;
  // What the code pages need from the route config: the app (loaded pattern rows don't carry it),
  // the install's own URL for links, and the site's Datasets patterns (for the add-ticket link).
  const pagesContext = {
    app: props.app,
    baseUrl: props.baseUrl === "/" ? "" : props.baseUrl,
    datasetPatterns: props.datasetPatterns || [],
  };

  return {
    ...pageCfg,
    // A signed-in user starts as a placeholder (groups ['public']) while their real
    // groups load (patterns/auth/providers.jsx). QA pages load fast enough to be
    // route-checked in that window, which sends a group-gated admin home, so the check
    // waits for the real user; it re-runs when the user changes (dms-manager/index.jsx).
    checkAuth: (props, navigate, path) =>
      props.user?.isAuthenticating ? false : defaultCheckAuth(props, navigate, path),
    // Starts downloading the page's section-type chunks, as the page pattern's
    // preload does. The loader's rows pass through untouched.
    preload: async (falcor, data, request, params) => {
      const page = findQaPage(buildQaPages(props.pattern, pagesContext), params?.['*'] || '');
      preloadSectionComponents(pageSectionTypes(page));
      return data;
    },
    children: [
      {
        ...shell,
        type: (shellProps) => <QaShell Shell={shell.type} {...shellProps} />,
        children: [
          {
            type: (routeProps) => <QaPageView {...routeProps} pattern={props.pattern} pagesContext={pagesContext} />,
            path: "/*",
            action: "view",
            authPermissions: props.authPermissions,
            reqPermissions: ["view-page"],
          },
        ],
      },
    ],
  };
};

export default [qaConfig];
