import React from "react";
import { useParams } from "react-router";
import { useFalcor } from "@availabs/avl-falcor";
import { loadDatasetRows } from "../../../api/datasetRows";
import PageView from "../../page/pages/view";
import { buildQaPages, findQaPage, coveredSites, COVERED_SITE_COLUMNS } from "./index";

// Picks the QA page for the URL and renders it with the page pattern's PageView,
// the way the admin pattern's routes render their own pages, rather than passing
// code pages through the wrapper's row matcher.
// - The slug comes from useParams(), not props: the wrapper caches its render on
//   its own rows, and a router hook re-renders on every URL change regardless.
// - Pages are rebuilt per URL, like loader rows are refetched per navigation, so
//   one visit's page state (immer freezes it) never carries into the next.
// - Keyed by slug so each page mounts with its own page state: PageView re-reads
//   page variables only when item.id changes, and code pages have no id.
// - The Overview's site cards come from the install's covered-sites dataset, read here once; the
//   pages are rebuilt when the rows arrive.
export default function QaPageView({ pattern, pagesContext, ...props }) {
  const slug = useParams()['*'] || '';
  const { falcor } = useFalcor();
  const [sites, setSites] = React.useState(null);
  const sitesRef = pattern?.qa?.datasets?.patterns;
  React.useEffect(() => {
    if (!sitesRef || !falcor) return;
    let current = true;
    loadDatasetRows(falcor, { env: `${pagesContext.app}+${sitesRef.slug}`, viewId: sitesRef.view_id, columns: COVERED_SITE_COLUMNS })
      .then((rows) => { if (current) setSites(coveredSites(rows)); })
      .catch(() => { if (current) setSites([]); });
    return () => { current = false; };
  }, [falcor, sitesRef?.slug, sitesRef?.view_id]);
  const pages = React.useMemo(() => buildQaPages(pattern, { ...pagesContext, sites }), [pattern, pagesContext, slug, sites]);
  const item = findQaPage(pages, slug);
  return <PageView key={slug} {...props} item={item} dataItems={pages} />;
}
