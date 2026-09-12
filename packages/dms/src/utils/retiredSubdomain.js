// Redirect a pattern's RETIRED subdomain to wherever that pattern now lives.
//
// When a pattern moves off its own subdomain onto a path on the root domain
// (`tsmo2.example.org/` → `www.example.org/tsmo`), every bookmark, emailed link
// and browser autocomplete still points at the old host. Hosting-level 301s are
// the right primary mechanism, but they have to be configured per deployment and
// per hostname, and they cannot cover local development at all.
//
// So a pattern row may declare `retired_subdomains: ["tsmo2", "tsmo"]`. Any of
// those subdomains resolves to that pattern's CURRENT primary mount on the root
// domain, keeping path, query and hash. Paths owned by another pattern
// (`/auth/login`, `/datasources`, `/docs/...`) keep their own path — sending
// `tsmo2.host/auth/login` to `/tsmo/auth/login` would lock the user out of the
// login screen, which is the one page they need most mid-cutover.
//
// Empty/absent `retired_subdomains` → no redirect map → this whole module is inert,
// which is every site that has not opted in.
//
// See planning/transportny/tasks/current/subdomain-to-path-consolidation.md.

import { parseIfJSON } from '../patterns/page/pages/_utils';
import { resolveMountPath } from './mountPath';
import { getBaseHost } from './subdomainPath';

// { "<retired subdomain>": "<target base_url>" } from the pattern rows. A pattern
// that lists a subdomain it STILL serves is ignored for that subdomain — a live
// mount must always win over a redirect, so a half-finished cutover degrades to
// "the old URL keeps working" rather than to a redirect loop.
export function buildRetiredSubdomainMap(patterns = [], isSubdomainLive = () => false) {
    const map = {};
    patterns.forEach((pattern) => {
        const retired = parseIfJSON(pattern?.retired_subdomains, []);
        if (!Array.isArray(retired)) return;
        retired.forEach((sub) => {
            const key = `${sub || ''}`.toLowerCase().trim();
            if (!key || isSubdomainLive(key)) return;
            if (map[key] === undefined) map[key] = pattern?.base_url ?? '/';
        });
    });
    return map;
}

// The absolute URL to send this request to, or null to serve it normally.
// Pure — the caller supplies the location parts, so it is testable and SSR-safe.
export function resolveRetiredSubdomainRedirect({
    host = '', subdomain = '', pathname = '/', search = '', hash = '',
    protocol = 'https:', retiredMap = {}, siteRootPaths = [],
}) {
    const sub = `${subdomain || ''}`.toLowerCase();
    if (!sub) return null;
    const targetBase = retiredMap[sub];
    if (targetBase === undefined) return null;

    const baseHost = getBaseHost(host);
    // Nothing to strip means we are already ON the root domain — redirecting would
    // loop. (Also guards a misconfigured map naming the root itself.)
    if (!baseHost || baseHost === host) return null;

    const path = resolveMountPath(pathname || '/', targetBase, siteRootPaths);
    return `${protocol}//www.${baseHost}${path}${search}${hash}`;
}

// Client-side application of the above. Returns true when a redirect was issued
// (the caller should stop — the document is on its way out). `replace` rather than
// `assign` so the retired URL does not sit in the back-stack waiting to bounce the
// user again when they hit Back.
export function applyRetiredSubdomainRedirect({ retiredMap, siteRootPaths, subdomain }) {
    if (typeof window === 'undefined') return false;
    const { host, pathname, search, hash, protocol } = window.location;
    const target = resolveRetiredSubdomainRedirect({
        host, subdomain, pathname, search, hash, protocol, retiredMap, siteRootPaths,
    });
    if (!target) return false;
    window.location.replace(target);
    return true;
}
