import React from "react";
import { useParams } from "react-router";
import { datasetRows } from "../datasets";
import PageView from "../../page/pages/view";
import { ThemeContext } from "../../../ui/useTheme";
import { withQaTheme } from "../withQaTheme";
import { buildQaPages, findQaPage, coveredSites, siteLabelsFrom, COVERED_SITE_COLUMNS } from "./index";

// Picks the QA page for the URL and renders it with the page pattern's PageView,
// the way the admin pattern's routes render their own pages, rather than passing
// code pages through the wrapper's row matcher.
// - The slug comes from useParams(), not props: the wrapper caches its render on
//   its own rows, and a router hook re-renders on every URL change regardless.
// - Pages are rebuilt per URL, like loader rows are refetched per navigation, so
//   one visit's page state (immer freezes it) never carries into the next.
// - Keyed by slug so each page mounts with its own page state: PageView re-reads
//   page variables only when item.id changes, and code pages have no id.
// - The Overview's site cards and every page's site labels come from the install's covered-sites
//   dataset, read here each time the view mounts (through apiLoad, which skips falcor's cache, so a
//   Configure save shows on the next visit); the pages are rebuilt when the rows arrive.
// - The pages get the site's theme with its `qa` key applied (withQaTheme.js), so only QA sections can
//   pick a `qa_*` style. They render inside a `.dms-qa-page` wrapper carrying the theme's `qa.vars`,
//   so a site's palette and fonts for QA (and the --qa-* tokens built on them) stay on QA pages.
export default function QaPageView({ pattern, pagesContext, ...props }) {
  const slug = useParams()['*'] || '';
  const [siteRows, setSiteRows] = React.useState(null);
  const sitesRef = pattern?.qa?.datasets?.patterns;
  const { apiLoad } = props;
  React.useEffect(() => {
    if (!sitesRef || !apiLoad) return;
    let current = true;
    datasetRows(apiLoad, pagesContext.app, sitesRef, COVERED_SITE_COLUMNS)
      .then((rows) => { if (current) setSiteRows(rows); })
      .catch(() => { if (current) setSiteRows([]); });
    return () => { current = false; };
  }, [sitesRef?.slug, sitesRef?.view_id]);
  const pages = React.useMemo(
    () => buildQaPages(pattern, { ...pagesContext, sites: siteRows && coveredSites(siteRows), siteLabels: siteLabelsFrom(siteRows || []) }),
    [pattern, pagesContext, slug, siteRows],
  );
  const item = findQaPage(pages, slug);
  const themeContext = React.useContext(ThemeContext) || {};
  const qaThemeContext = React.useMemo(() => ({ ...themeContext, theme: withQaTheme(themeContext.theme) }), [themeContext]);
  const qa = qaThemeContext.theme?.qa || {};
  return (
    <ThemeContext.Provider value={qaThemeContext}>
      <div className={`dms-qa-page ${qa.pageWrapper || ''}`} style={qa.vars}>
        <PageView key={slug} {...props} item={item} dataItems={pages} />
      </div>
    </ThemeContext.Provider>
  );
}
