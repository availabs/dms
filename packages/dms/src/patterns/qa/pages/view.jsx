import React from "react";
import { useParams } from "react-router";
import PageView from "../../page/pages/view";
import { buildQaPages, findQaPage } from "./index";

// Picks the QA page for the URL and renders it with the page pattern's PageView,
// the way the admin pattern's routes render their own pages, rather than passing
// code pages through the wrapper's row matcher.
// - The slug comes from useParams(), not props: the wrapper caches its render on
//   its own rows, and a router hook re-renders on every URL change regardless.
// - Pages are rebuilt per URL, like loader rows are refetched per navigation, so
//   one visit's page state (immer freezes it) never carries into the next.
// - Keyed by slug so each page mounts with its own page state: PageView re-reads
//   page variables only when item.id changes, and code pages have no id.
export default function QaPageView({ pattern, ...props }) {
  const slug = useParams()['*'] || '';
  const pages = React.useMemo(() => buildQaPages(pattern), [pattern, slug]);
  const item = findQaPage(pages, slug);
  return <PageView key={slug} {...props} item={item} dataItems={pages} />;
}
