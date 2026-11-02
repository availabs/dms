// The PDF Generator section's non-UI half (ComponentRegistry/ExportPdf.jsx): the plan's page tree,
// selection helpers, and the calls to dms-server's export job (packages/dms-server/src/pdf).
// Rendering happens on the server, in headless Chrome, page by page; the job is polled because a
// large plan takes longer than a proxied request may stay open.
import { navPath } from '../../../../utils/nav';

const byIndex = (a, b) => (+a.index || 0) - (+b.index || 0);

/**
 * The plan's pages as a tree in nav order: [{ id, title, path, draft, hidden, children }].
 * Unlike the site nav, pages hidden from the nav are kept (they are still plan pages) and drafts are
 * kept, marked, so an author sees why they won't print. Link pages and cover pages are left out.
 * `baseUrl` is where the plan is mounted on this site (navPrefix + base_url, no trailing slash).
 */
export function buildPageTree(pages, baseUrl) {
    const rows = (pages || []).filter(p => !p.nav_link && p.is_cover_page !== 'yes');
    // ids compared as strings: the sync mirror returns ids as strings, a page's `parent` may be a number
    const ids = new Set(rows.map(p => `${p.id}`));
    const node = (p) => ({
        id: p.id,
        title: `${p.title || p.name || ''}`.trim() || `Page ${p.id}`,
        path: navPath(p, baseUrl, false),
        draft: p.published === 'draft',
        hidden: !!p.hide_in_nav && p.hide_in_nav !== 'false',
        children: rows.filter(c => c.parent != null && `${c.parent}` === `${p.id}`).sort(byIndex).map(node),
    });
    // a page whose parent isn't in the list (deleted, or a link page) shows at the top level
    return rows.filter(p => !p.parent || !ids.has(`${p.parent}`)).sort(byIndex).map(node);
}

export const coverPages = (pages) => (pages || []).filter(p => !p.nav_link && p.is_cover_page === 'yes');

// Every page under (and including) `node` that can be printed (not a draft).
export function printableIds(node) {
    const out = node.draft ? [] : [node.id];
    node.children.forEach(c => out.push(...printableIds(c)));
    return out;
}

// The selected pages in print order (a walk of the tree), each with its depth for the contents page.
export function selectedInOrder(tree, selected, depth = 0, out = []) {
    tree.forEach(n => {
        if (!n.draft && selected.has(n.id)) out.push({ ...n, depth });
        selectedInOrder(n.children, selected, depth + 1, out);
    });
    return out;
}

// The tree narrowed to pages whose title matches `query`, with the ancestors that lead to them.
export function filterTree(tree, query) {
    const q = `${query || ''}`.trim().toLowerCase();
    if (!q) return tree;
    return tree.reduce((acc, n) => {
        const children = filterTree(n.children, q);
        if (n.title.toLowerCase().includes(q) || children.length) acc.push({ ...n, children });
        return acc;
    }, []);
}

export const fileNameFor = (name) => `${name || 'plan'}`.toLowerCase().trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';

// --- the export job ------------------------------------------------------------------------------

async function call(url, options) {
    let res;
    try {
        res = await fetch(url, options);
    } catch (e) {
        const err = new Error('Could not reach the export service.');
        err.status = 0;
        throw err;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body?.error || `The export service returned ${res.status}.`);
        err.status = res.status;
        throw err;
    }
    return body;
}

/**
 * Starts an export. `mode` 'public' (default) sends no token, so the server's headless browser sees
 * what an anonymous visitor sees; 'self' sends the caller's token so it sees what they see.
 */
export function startPdfExport({ API_HOST, pages, coverUrl, toc, fileName, mode = 'public', token }) {
    const headers = { 'Content-Type': 'application/json' };
    if (mode === 'self' && token) headers.Authorization = token;
    return call(`${API_HOST}/pdf/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            pages: pages.map(p => ({ url: p.url, title: p.title, depth: p.depth })),
            cover_url: coverUrl || null,
            toc: !!toc,
            file_name: fileName,
            mode,
        }),
    });
}

export const pdfExportStatus = ({ API_HOST, id }) => call(`${API_HOST}/pdf/export/${id}`);

export const cancelPdfExport = ({ API_HOST, id }) => call(`${API_HOST}/pdf/export/${id}`, { method: 'DELETE' }).catch(() => {});

// The zip is served with Content-Disposition: attachment, so following the link downloads it in place,
// without holding a large file in page memory.
export function downloadPdfExport({ API_HOST, id }) {
    const link = document.createElement('a');
    link.href = `${API_HOST}/pdf/export/${id}/file`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
}
