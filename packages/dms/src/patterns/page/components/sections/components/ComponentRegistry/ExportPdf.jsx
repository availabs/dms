import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageContext, CMSContext } from '../../../../context';
import { ThemeContext, getComponentTheme } from "../../../../../../ui/useTheme";
import { getInstance } from "../../../../../../utils/type-utils";
import { mountsForSubdomain } from "../../../../../../utils/patternMounts";
import { navPath } from "../../../../../../utils/nav";
import {
  buildPageTree, coverPages as getCoverPages, printableIds, selectedInOrder, filterTree, fileNameFor,
  startPdfExport, pdfExportStatus, cancelPdfExport, downloadPdfExport,
} from '../../../saveAsPDF/pdfExport';
import { pdfExportTheme } from './ExportPdf.theme';

// The PDF Generator section: pick a plan on this site, tick its pages, and export them as one PDF.
// Mockup: design_system_v6/pages/page-pdf-export.html. Rendering is a dms-server job (src/pdf) that
// opens each page in headless Chrome, waits for its data, and prints it; this component starts the job,
// polls it, and downloads the zip. Task: src/dms/planning/tasks/completed/pdf-exporter-rework.md.

const POLL_MS = 1500;
// A title cut off by `truncate` shows in full on hover; one that fits gets no tooltip.
const titleIfCropped = (e) => {
  const el = e.currentTarget;
  el.title = el.scrollWidth > el.clientWidth ? el.textContent : '';
};
const formatElapsed = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
};

export function PdfExport() {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...pdfExportTheme, ...getComponentTheme(themeFromContext, 'pages.pdfExport') };
  const { app, API_HOST, sitePatterns, subdomain = '', type: currentType, user } = React.useContext(CMSContext) || {};
  const { apiLoad } = React.useContext(PageContext) || {};
  const { Icon, Button, Input, Select, Switch, FieldLabel, ColumnTypes } = UI || {};
  const CheckboxEdit = ColumnTypes?.checkbox?.EditComp;

  // Only plans this site serves: a page pattern with a mount on the current subdomain. A plan on another
  // subdomain has no pages here, so it is never offered.
  const plans = useMemo(() => (sitePatterns || [])
    .filter(p => p?.pattern_type === 'page' && p.id !== 'no-access')
    .map(p => {
      const mount = mountsForSubdomain(p, subdomain)[0];
      const docType = getInstance(p.type) || p.doc_type;
      if (!mount || !docType) return null;
      const base = `/${`${mount.base_url || ''}`.replace(/^\/|\/$/g, '')}`;
      return {
        id: `${p.id}`,
        app: p.app || app,
        docType,
        name: p.name || docType,
        baseUrl: `${mount.navPrefix || ''}${base}`.replace(/\/+$/, ''),
      };
    })
    .filter(Boolean), [sitePatterns, subdomain, app]);

  const [planId, setPlanId] = useState(null);
  const plan = plans.find(p => p.id === planId) || plans.find(p => p.docType === currentType) || plans[0] || null;

  const [pages, setPages] = useState(null);           // null while loading
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [coverId, setCoverId] = useState('');
  const [toc, setToc] = useState(true);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState('public');
  const [job, setJob] = useState(null);                // { state, id, startedAt, done, total, current, skipped, error, status }
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);

  // The plan's pages. A response for a plan that is no longer picked is ignored, and the selection
  // starts over (all published pages ticked) whenever a plan's list arrives. The loader swallows
  // request errors and hands back [] (api/index.js), so an empty list is asked for again before the
  // plan is called empty: a page pattern always has pages.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!plan || !apiLoad) return;
    let ignore = false;
    setPages(null);
    setSelected(new Set());
    const load = () => apiLoad({
      format: {
        app: plan.app,
        type: `${plan.docType}|page`,      // page rows are `{instance}|page`
        attributes: ['title', 'url_slug', 'id', 'parent', 'hide_in_nav', 'published', 'index', 'is_cover_page', 'nav_link'],
      },
      children: [{ type: () => {}, action: 'list', path: '/' }],
    }).then(res => (Array.isArray(res) ? res : [])).catch(() => []);
    (async () => {
      let rows = await load();
      for (const wait of [500, 1500]) {
        if (ignore || rows.length) break;
        await new Promise(r => setTimeout(r, wait));
        if (!ignore) rows = await load();
      }
      if (ignore) return;
      setPages(rows);
      const tree = buildPageTree(rows, plan.baseUrl);
      setSelected(new Set(tree.flatMap(printableIds)));
      setExpanded(new Set());
      setCoverId('');
      setFileName(fileNameFor(plan.name));
    })();
    return () => { ignore = true; };
  }, [plan?.id, plan?.baseUrl, apiLoad, reloadKey]);

  const tree = useMemo(() => buildPageTree(pages || [], plan?.baseUrl || ''), [pages, plan?.baseUrl]);
  const covers = useMemo(() => getCoverPages(pages || []), [pages]);
  const allIds = useMemo(() => tree.flatMap(printableIds), [tree]);
  const ordered = useMemo(() => selectedInOrder(tree, selected), [tree, selected]);
  const shownTree = useMemo(() => filterTree(tree, query), [tree, query]);
  const cover = covers.find(c => `${c.id}` === `${coverId}`);

  // Ticking a page ticks its printable sub-pages; a fully ticked branch unticks as a whole.
  const toggle = (node) => {
    const ids = printableIds(node);
    const all = ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const expandAll = () => {
    const ids = [];
    const walk = (nodes) => nodes.forEach(n => { if (n.children.length) { ids.push(n.id); walk(n.children); } });
    walk(tree);
    setExpanded(new Set(ids));
  };

  // --- the export job ---
  const running = job?.state === 'starting' || job?.state === 'queued' || job?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  useEffect(() => () => clearTimeout(pollRef.current), []);

  const poll = (id, startedAt) => {
    pollRef.current = setTimeout(async () => {
      try {
        const s = await pdfExportStatus({ API_HOST, id });
        setJob(j => (j?.id === id ? { ...j, ...s, startedAt } : j));
        if (s.state === 'done') {
          downloadPdfExport({ API_HOST, id });
          setJob(j => (j?.id === id ? { ...j, finishedAt: Date.now() } : j));
        } else if (['queued', 'running'].includes(s.state)) {
          poll(id, startedAt);
        }
      } catch (e) {
        setJob(j => (j?.id === id ? { ...j, state: 'failed', error: e.message, status: e.status } : j));
      }
    }, POLL_MS);
  };

  const exportPdf = async () => {
    const origin = window.location.origin;
    const startedAt = Date.now();
    setNow(startedAt);
    setJob({ state: 'starting', startedAt, done: 0, total: ordered.length });
    try {
      const res = await startPdfExport({
        API_HOST,
        pages: ordered.map(p => ({ url: `${origin}${p.path}`, title: p.title, depth: p.depth })),
        coverUrl: cover ? `${origin}${navPath(cover, plan.baseUrl, false)}` : null,
        toc,
        fileName: fileName || fileNameFor(plan?.name),
        mode,
        token: user?.token,
      });
      setJob({ ...res, startedAt });
      poll(res.id, startedAt);
    } catch (e) {
      setJob({ state: 'failed', error: e.message, status: e.status, startedAt });
    }
  };
  const cancel = () => {
    clearTimeout(pollRef.current);
    if (job?.id) cancelPdfExport({ API_HOST, id: job.id });
    setJob(null);
  };

  if (!UI || !CheckboxEdit) return null;

  const renderTree = (nodes, depth = 0) => nodes.map(n => {
    const ids = printableIds(n);
    const count = ids.filter(id => selected.has(id)).length;
    const checked = ids.length > 0 && count === ids.length;
    const partial = count > 0 && !checked;
    const open = !!query || expanded.has(n.id);
    return (
      <div key={n.id}>
        <div className={n.draft ? t.rowDraft : t.row} style={{ paddingLeft: 4 + depth * t.indentPx }}>
          {n.children.length ? (
            <button type="button" className={t.chevron} onClick={() => toggleExpand(n.id)}
                    aria-expanded={open} title={open ? 'Collapse' : 'Expand'}>
              <Icon icon={open ? 'ChevronDown' : 'ChevronRight'} className={t.chevronIcon} />
            </button>
          ) : <span className={t.chevronSpacer} />}
          <CheckboxEdit
            value={checked || partial}
            indeterminate={partial}
            disabled={!ids.length || running}
            aria-label={n.title}
            onChange={() => toggle(n)}
          />
          {n.draft
            ? <span className={t.rowTitleDraft} onMouseEnter={titleIfCropped}>{n.title}</span>
            : <button type="button" className={t.rowTitle} disabled={running} onClick={() => toggle(n)} onMouseEnter={titleIfCropped}>{n.title}</button>}
          {n.draft ? <span className={t.markDraft} title="Drafts can’t be exported until they’re published.">draft · not exported</span> : null}
          {n.hidden ? <span className={t.markHidden}>hidden in nav</span> : null}
        </div>
        {n.children.length && open ? renderTree(n.children, depth + 1) : null}
      </div>
    );
  });

  const elapsed = formatElapsed((job?.finishedAt || now) - (job?.startedAt || now));
  const skipped = job?.skipped || [];
  // The action bar under the card: the summary and Export, or the export's progress / result.
  const statusBar = () => {
    if (running) {
      const pct = job.total ? Math.round(((job.done || 0) / job.total) * 100) : 0;
      return <div className={t.barStack}>
        <div className={t.statusRow}>
          <span className={t.spinner} />
          <span className={t.statusBody}>
            <span className={t.statusTitle}>
              {job.state === 'queued' && job.queuedAhead ? `Waiting for ${job.queuedAhead} export${job.queuedAhead > 1 ? 's' : ''} ahead`
                : `Building the PDF · ${job.done || 0} of ${job.total} pages`}
            </span>
            {job.current ? <span className={t.statusText}>{job.current}</span> : null}
            <span className={t.progressTrack}><span className={t.progressBar} style={{ width: `${Math.max(4, pct)}%` }} /></span>
            <span className={t.hint}>Don’t close this tab while the PDF is building.</span>
          </span>
        </div>
        <div className={t.statusActions}>
          <span className={t.elapsed}>{elapsed}</span>
          <Button activeStyle="action" onClick={cancel}>Cancel</Button>
        </div>
      </div>;
    }
    if (job?.state === 'done') {
      return <div className={t.barStack}>
        <div className={t.statusRow}>
          <Icon icon="Check" className={`${t.statusIcon} ${t.statusGo}`} />
          <span className={t.statusBody}>
            <span className={t.statusTitle}>{job.fileName}.zip downloaded</span>
            <span className={t.statusText}>{job.fileName}.pdf inside · {job.total - skipped.length} pages · {elapsed}</span>
            {skipped.length ? <>
              <span className={t.statusText}>{skipped.length} page{skipped.length > 1 ? 's' : ''} left out:</span>
              <ul className={t.skippedList}>{skipped.map(s => <li key={s.url}>{s.title || s.url} ({s.reason})</li>)}</ul>
            </> : null}
          </span>
        </div>
        <div className={t.statusActions}>
          <Button activeStyle="action" onClick={() => downloadPdfExport({ API_HOST, id: job.id })}>
            <Icon icon="Download" className={t.statusIcon} />Download again
          </Button>
          <Button activeStyle="action" onClick={() => setJob(null)}>Export another</Button>
        </div>
      </div>;
    }
    if (job?.state === 'failed') {
      const missing = job.status === 404 && !job.id;
      return <div className={t.barStack}>
        <div className={t.statusRow}>
          <Icon icon="Alert" className={`${t.statusIcon} ${missing ? t.statusAmber : t.statusBrick}`} />
          <span className={t.statusBody}>
            <span className={t.statusTitle}>{missing ? 'PDF export isn’t set up on this site’s server' : 'Couldn’t build the PDF'}</span>
            <span className={t.statusText}>{missing ? 'Ask a site admin. (The export service returned 404.)' : `${job.error || 'Unknown error.'} Nothing was downloaded.`}</span>
          </span>
        </div>
        <div className={t.statusActions}>
          {missing ? null : <Button activeStyle="action" onClick={exportPdf}><Icon icon="Refresh" className={t.statusIcon} />Try again</Button>}
          <Button activeStyle="action" onClick={() => setJob(null)}>Back</Button>
        </div>
      </div>;
    }
    const summary = ordered.length
      ? [cover ? 'Cover' : null, toc ? 'Contents' : null, `${ordered.length} page${ordered.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
      : 'Select at least one page.';
    return <div className={t.barIdle}>
      <span className={t.statusBody}>
        <span className={t.summary}>{summary}</span>
        <span className={t.paper}>US Letter, portrait · large plans take a few minutes</span>
      </span>
      <Button activeStyle="primary" onClick={exportPdf} disabled={!ordered.length}>
        <Icon icon="Download" className={t.statusIcon} />
        {ordered.length ? `Export PDF (.zip) · ${ordered.length} page${ordered.length > 1 ? 's' : ''}` : 'Export PDF (.zip)'}
      </Button>
    </div>;
  };

  const planField = plans.length > 1 ? (
    <div className={t.planField}>
      <FieldLabel text="plan" />
      <Select
        searchable
        options={plans.map(p => ({ label: `${p.name} (${p.docType})`, value: p.id }))}
        value={plan?.id || ''}
        onChange={(v) => { setPlanId(v); setQuery(''); setJob(null); }}
        placeholder="Select a plan…"
      />
    </div>
  ) : plan ? (
    <div>
      <FieldLabel text="plan" />
      <p className={t.planStatic}>{plan.name}<span className={t.planSlug}>{plan.docType}</span></p>
    </div>
  ) : null;

  if (!plan) {
    return <div className={t.empty}>
      <p className={t.emptyTitle}>No plans on this site</p>
      <p className={t.emptyText}>No page pattern is served on this site’s address.</p>
    </div>;
  }

  if (pages && !allIds.length && !tree.length) {
    return <div className={t.wrapper}>
      <div className={t.planRow}>{planField}</div>
      <div className={t.empty}>
        <p className={t.emptyTitle}>This plan has no published pages</p>
        <p className={t.emptyText}>Publish a page in {plan.name} to export it.</p>
        <Button activeStyle="linkMeta" onClick={() => setReloadKey(k => k + 1)}>Check again</Button>
      </div>
    </div>;
  }

  // a field label with a hint icon beside it; the hint is the icon's title, shown on hover
  const hinted = (text, hint) => (
    <span className={t.labelRow}>
      <FieldLabel text={text} />
      <span className={t.help} title={hint}><Icon icon="InfoCircle" className={t.helpIcon} /></span>
    </span>
  );

  // Layout B from the mockup (owner 2026-11-02): one card. Settings across the top, the page list (scrolls)
  // beside what the PDF will hold, and an action bar at the bottom.
  return (
    <div className={t.wrapper}>
      <div className={t.planRow}>{planField}</div>
      <section className={t.card}>
        <div className={t.settings}>
          <div>
            {hinted('cover page', covers.length
              ? 'Pages marked “Cover page” in page settings. Not counted in the contents.'
              : 'Turn on “Cover page” in a page’s settings to use it as a cover. Cover pages are left out of the page list.')}
            <Select
              options={[{ label: 'None', value: '' }, ...covers.map(c => ({ label: c.title || `Page ${c.id}`, value: `${c.id}` }))]}
              value={`${coverId}`}
              onChange={(v) => setCoverId(v || '')}
              placeholder={covers.length ? 'None' : 'No cover pages'}
              disabled={!covers.length || running}
            />
          </div>
          <div>
            <FieldLabel text="table of contents" />
            <div className={t.switchWrap}>
              <Switch size="small" enabled={toc} setEnabled={setToc} disabled={running} label="Table of contents" />
            </div>
          </div>
          <div>
            {hinted('export as', 'Public: pages as a visitor who isn’t signed in sees them; pages they can’t open are left out. As me: pages as you see them when signed in, including ones only you can open.')}
            <div className={t.seg}>
              <Button activeStyle={mode === 'public' ? 'segmentOn' : 'segment'} disabled={running} onClick={() => setMode('public')}>Public</Button>
              <Button activeStyle={mode === 'self' ? 'segmentOn' : 'segment'} disabled={running || !user?.token} onClick={() => setMode('self')}>As me</Button>
            </div>
          </div>
          <div>
            <FieldLabel text="file name" />
            <div className={t.fileRow}>
              <Input value={fileName} disabled={running} onChange={e => setFileName(e.target.value)} />
              <span className={t.fileExt}>.zip</span>
            </div>
          </div>
        </div>

        <div className={t.body}>
          <div className={t.pagesPane}>
            <div className={t.pagesHead}>
              <span className={t.cardTitle}>Pages</span>
              {pages === null ? null : <span className={t.count}>{selected.size} of {allIds.length}</span>}
              <span className={t.filterWrap}>
                <Input activeStyle="search" aria-label="Filter pages" placeholder="Filter pages…" value={query} onChange={e => setQuery(e.target.value)} />
              </span>
              <span className={t.headActions}>
                <Button activeStyle="linkMeta" disabled={running} onClick={() => setSelected(new Set(allIds))}>select all</Button>
                <span className={t.sep}>·</span>
                <Button activeStyle="linkMeta" disabled={running} onClick={() => setSelected(new Set())}>clear</Button>
                <span className={t.sep}>·</span>
                <Button activeStyle="linkMeta" onClick={expandAll}>expand all</Button>
                <span className={t.sep}>·</span>
                <Button activeStyle="linkMeta" onClick={() => setExpanded(new Set())}>collapse all</Button>
              </span>
            </div>
            <div className={t.tree}>
              {pages === null ? <p className={t.treeEmpty}>Loading pages…</p>
                : shownTree.length ? renderTree(shownTree)
                : <p className={t.treeEmpty}>No pages match “{query}”.</p>}
            </div>
          </div>

          {/* one row per page: where a page breaks across sheets isn't known until it prints */}
          <div className={t.outlinePane}>
            <span className={t.cardTitle}>In this PDF</span>
            <ol className={t.outline}>
              {ordered.length ? <>
                {cover ? <li className={t.outlineMuted} style={{ paddingLeft: t.outlinePadPx }}>
                  <Icon icon="File" className={t.outlineIcon} /><span className={t.outlineText} onMouseEnter={titleIfCropped}>Cover · {cover.title}</span>
                </li> : null}
                {toc ? <li className={t.outlineMuted} style={{ paddingLeft: t.outlinePadPx }}>
                  <Icon icon="File" className={t.outlineIcon} /><span className={t.outlineText}>Contents</span>
                </li> : null}
                {(() => {
                  let n = 0;
                  return ordered.map(p => (
                    <li key={p.id} className={t.outlineItem} style={{ paddingLeft: t.outlinePadPx + p.depth * t.outlineIndentPx }}>
                      <Icon icon="File" className={t.outlineIcon} />
                      <span className={t.outlineText} onMouseEnter={titleIfCropped}>{p.depth ? '' : `${++n}. `}{p.title}</span>
                    </li>
                  ));
                })()}
              </> : <li className={t.outlineEmpty}>No pages selected.</li>}
            </ol>
          </div>
        </div>

        <div className={t.bar}>{statusBar()}</div>
      </section>
    </div>
  );
}
