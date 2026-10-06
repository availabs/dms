import React from "react";
import { useParams } from "react-router";
import { useFalcor } from "@availabs/avl-falcor";
import { loadDatasetRows } from "../../../api/datasetRows";
import PageView from "../../page/pages/view";
import { ThemeContext } from "../../../ui/useTheme";
import { withQaTheme } from "../qa.theme";
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
//   dataset, read here once; the pages are rebuilt when the rows arrive.
// - The pages get the site's theme plus the qa pattern's own named styles (qa.theme.js), so only QA
//   sections can pick a `qa_*` style.
export default function QaPageView({ pattern, pagesContext, ...props }) {
  const slug = useParams()['*'] || '';
  const { falcor } = useFalcor();
  const [siteRows, setSiteRows] = React.useState(null);
  const sitesRef = pattern?.qa?.datasets?.patterns;
  React.useEffect(() => {
    if (!sitesRef || !falcor) return;
    let current = true;
    loadDatasetRows(falcor, { env: `${pagesContext.app}+${sitesRef.slug}`, viewId: sitesRef.view_id, columns: COVERED_SITE_COLUMNS })
      .then((rows) => { if (current) setSiteRows(rows); })
      .catch(() => { if (current) setSiteRows([]); });
    return () => { current = false; };
  }, [falcor, sitesRef?.slug, sitesRef?.view_id]);
  const pages = React.useMemo(
    () => buildQaPages(pattern, { ...pagesContext, sites: siteRows && coveredSites(siteRows), siteLabels: siteLabelsFrom(siteRows || []) }),
    [pattern, pagesContext, slug, siteRows],
  );
  const item = findQaPage(pages, slug);
  const themeContext = React.useContext(ThemeContext) || {};
  const qaThemeContext = React.useMemo(() => ({ ...themeContext, theme: withQaTheme(themeContext.theme) }), [themeContext]);
  return (
    <ThemeContext.Provider value={qaThemeContext}>
      <PageView key={slug} {...props} item={item} dataItems={pages} />
    </ThemeContext.Provider>
  );
}
