import React from "react";
import pageConfig from "../page/siteConfig";
import { preloadSectionComponents } from "../page/components/sections/componentRegistry";
import { pageSectionTypes } from "../../api/preloadSectionData.js";
import { buildQaPages, findQaPage } from "./pages";
import QaPageView from "./pages/view";

// The `qa` pattern type: ticketing / delivery QA. Its pages are code (./pages),
// there is no editor, and each qa pattern row is its own install. Like every
// pattern it declares its own route list; it borrows the page pattern's context
// shell (theme, CMSContext, route auth) and page format, so sections render
// exactly as they do on a page pattern.
const qaConfig = (props) => {
  const pageCfg = pageConfig[0]({ ...props, hasEditor: false });
  const [shell] = pageCfg.children;

  return {
    ...pageCfg,
    // Starts downloading the page's section-type chunks, as the page pattern's
    // preload does. The loader's rows pass through untouched.
    preload: async (falcor, data, request, params) => {
      const page = findQaPage(buildQaPages(props.pattern), params?.['*'] || '');
      preloadSectionComponents(pageSectionTypes(page));
      return data;
    },
    children: [
      {
        ...shell,
        children: [
          {
            type: (routeProps) => <QaPageView {...routeProps} pattern={props.pattern} />,
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
