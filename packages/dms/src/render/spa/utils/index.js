/* global process */
import React from 'react'
import { cloneDeep } from "lodash-es"
import { useFalcor } from "@availabs/avl-falcor"
import { withAuth,  dmsPageFactory } from '../../../'
import { parseIfJSON } from '../../../patterns/page/pages/_utils';
import { getInstance } from '../../../utils/type-utils';
import patternTypes from '../../../patterns'
import { updateAttributes, updateRegisteredFormats } from "../../../dms-manager/_utils";
import RootErrorBoundary from './RootErrorBoundary'
import PatternTitle from './PatternTitle'


export const getSubdomain = (host) => {
    // ---
    // takes host string and returns subdomain
    // only works with single depth subdomains
    // ---
    // Strip port (e.g., "songs.localhost:3001" → "songs.localhost")
    const hostname = host.split(':')[0]
    // localhost is a single-part TLD, so "sub.localhost" has 2 parts.
    // Real domains like "example.com" have 2 parts, "sub.example.com" has 3.
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost')
    const minParts = isLocalhost || process.env.NODE_ENV === "development" ? 2 : 3
    const parts = hostname.split('.')
    // A real domain's rightmost label (TLD) can never be all-digits (ICANN
    // disallows fully-numeric TLDs for exactly this reason), but a bare
    // IPv4 host's last octet always is — e.g. "74.50.76.166" would
    // otherwise be misread as subdomain "74". Bail out before that happens.
    if (/^\d+$/.test(parts[parts.length - 1])) return false
    return parts.length >= minParts ? parts[0].toLowerCase() : false
}

function resolveSubdomainFilters(rawFilters, subdomain) {
    const parsed = parseIfJSON(rawFilters, []);
    if (Array.isArray(parsed)) return parsed;               // old format
    return parsed[subdomain] || parsed['*'] || [];          // new format
}

function resolveSubdomainAuthPermissions(rawAuth, subdomain) {
    const parsed = parseIfJSON(rawAuth || '{}', {});
    if (parsed['*'] !== undefined)                          // new format
        return parseIfJSON(parsed[subdomain] || parsed['*'] || {});
    return parseIfJSON(parsed);                                          // old format
}

/**
 * A pattern's mount list: the primary {subdomain, base_url} pair plus any
 * additional `locations` rows, so one pattern can be served at more than one
 * location (e.g. freightatlas2:/ AND www:/freightatlas). Additive + BC — no
 * `locations` → [primary] → identical single-mount behavior. Invalid rows are
 * dropped and duplicates of an earlier mount (same subdomain + normalized
 * base_url) are deduped so a location echoing the primary can't register the
 * same routes twice. See planning/tasks/current/pattern-multi-location-mounts.md.
 */
// Hosts whose subdomain is treated as the ROOT domain (see the SUBDOMAIN
// normalization in pattern2routes) — location rows use the same aliasing so
// "www" means what authors expect.
const ROOT_SUBDOMAIN_ALIASES = ['www', 'hazardmitigation'];

function getPatternMounts(pattern) {
    const normalize = (u) => `/${(u || '').replace(/^\/|\/$/g, '')}`;
    const mounts = [{ subdomain: pattern.subdomain, base_url: pattern.base_url, isPrimary: true }];
    const extra = parseIfJSON(pattern?.locations, []);
    (Array.isArray(extra) ? extra : []).forEach(loc => {
        if (!loc || typeof loc !== 'object') return;
        if (loc.base_url === undefined && loc.subdomain === undefined) return;
        mounts.push({ subdomain: loc.subdomain, base_url: loc.base_url });
    });
    const seen = new Set();
    return mounts.filter(m => {
        const key = `${m.subdomain ?? ''}|${normalize(m.base_url)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}




// --
// to do:
// Allow users to pass Pattern Configs
// --
//console.log('hola', pageConfig)


export function pattern2routes (siteData, props) {
    let {
        dmsConfig,
        adminPath = '/list',
        authPath,
        authWrapper = withAuth,
        themes = { default: {} },
        pgEnvs = [],
        API_HOST = 'https://graph.availabs.org',
        DAMA_HOST = 'https://graph.availabs.org',
        damaBaseUrl,
        PROJECT_NAME,
        damaDataTypes,
        damaMapPlugins,
        isMultiTenant = false,
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = props


    let SUBDOMAIN = getSubdomain(host)
    // for weird double subdomain tld
    SUBDOMAIN = ['www', 'hazardmitigation'].includes(SUBDOMAIN) ? '' : SUBDOMAIN;

    const dbThemes = (siteData?.[0]?.theme_refs || [])
      .reduce((out,theme) => {
          out[theme.name] = parseIfJSON(theme.theme)
          return out
      }, {})
    //console.log('patterns2routes',dbThemes)

    themes = themes?.default ? { ...themes, ...dbThemes } : { ...themes, ...dbThemes, default: {} }
    // console.log('dmsSiteFactory themes', themes)

    let dmsConfigUpdated = cloneDeep(dmsConfig);
    const siteType = dmsConfig?.format?.type || dmsConfig.type;
    const siteInstance = getInstance(siteType) || siteType;
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteInstance)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteInstance)

    // console.log('dmsConfigUpdated', dmsConfigUpdated)
    const authPattern = siteData
      .reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], [])
      .find(p => p.pattern_type === 'auth');

    const authBaseUrl = authPath
      || (authPattern?.base_url ? `/${authPattern.base_url.replace(/^\/|\/$/g, '')}` : '/auth');

    let AdminPattern = {
      app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
      type: siteType,
      doc_type: siteInstance,
      siteType: siteInstance,
      base_url: adminPath,
      //format: pattern?.config,
      pattern: {},
      pattern_type: 'admin',
      subdomain: "*",
      authPermissions: authPattern?.authPermissions || "{}",
      theme: themes['default'],
      themes
    }
  const patterns = [
    AdminPattern,
    ...(siteData
      .reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], [])
      || [])
  ];

    // Build datasetPatterns once (for backwards compatibility with other patterns)
    const datasetPatterns = patterns.filter(p => ['forms', 'datasets', 'mapeditor'].includes(p.pattern_type));

    const app = dmsConfigUpdated?.format?.app || dmsConfigUpdated.app;

    // Extract dmsEnv rows from site data (loaded via dms-format attribute)
    const dmsEnvs = siteData
      .reduce((acc, curr) => [...acc, ...(curr?.dms_envs || [])], []);

    // Index dmsEnvs by ID for fast lookup
    const dmsEnvById = {};
    for (const env of dmsEnvs) {
      if (env.id) dmsEnvById[env.id] = env;
    }

    // Build per-pattern datasources based on dmsEnvId (or fall back to legacy)
    function buildDatasources(pattern) {
      const external = (pgEnvs || []).map(env => ({
        type: 'external',
        env,
        baseUrl: damaBaseUrl || '',
        label: 'external',
        srcAttributes: ['name', 'metadata'],
        viewAttributes: ['version', '_modified_timestamp'],
      }));

      // If pattern has dmsEnvId, use that dmsEnv's sources to find which
      // dataset patterns own those sources. Otherwise fall back to all datasetPatterns.
      const dmsEnvId = pattern?.dmsEnvId;
      const dmsEnv = dmsEnvId ? dmsEnvById[dmsEnvId] : null;

      // Build one internal datasource per UNIQUE source-set. Sources live on
      // dmsEnv rows; the server resolves env→pattern→pattern.dmsEnvId→sources.
      // If two datasetPatterns share a dmsEnvId, both produce envs that
      // surface the same sources, so the picker would show every source
      // twice. Dedupe by dmsEnvId to make each unique source-set queryable
      // exactly once. Patterns with no dmsEnvId (legacy "sources on pattern"
      // model) each remain unique entry points.
      const internal = [];
      const seenDmsEnvIds = new Set();
      for (const dsPattern of datasetPatterns) {
        const dsDmsEnvId = dsPattern.dmsEnvId;
        if (dsDmsEnvId) {
          if (seenDmsEnvIds.has(dsDmsEnvId)) continue;
          seenDmsEnvIds.add(dsDmsEnvId);
        }
        internal.push({
          type: 'internal',
          env: `${app}+${getInstance(dsPattern.type) || dsPattern.doc_type}`,
          baseUrl: '/forms',
          label: 'managed',
          isDms: true,
          srcAttributes: ['app', 'name', 'config', 'default_columns'],
          viewAttributes: ['name', 'updated_at'],
          pattern: dsPattern,
        });
      }

      return [...external, ...internal];
    }

    // Build global datasources (used when no per-pattern override)
    const datasources = buildDatasources(null);

    // console.log('dmssite factory, datasources', datasources)

    return [
        ...patterns
          .filter(pattern => pattern?.pattern_type)
          .reduce((acc, pattern) => {

            const c = patternTypes[pattern.pattern_type];
            if(!c) return acc;
            // One route set per matching MOUNT (primary + `locations`). The
            // primary mount keeps the pre-existing matching byte-for-byte (BC);
            // location mounts additionally alias root subdomains ("www" ≡ root,
            // matching the SUBDOMAIN normalization above) so a location like
            // {subdomain: "www", base_url: "/freightatlas"} works as authored.
            const mounts = getPatternMounts(pattern).filter(mount => {
                const mountSub = mount.isPrimary || !ROOT_SUBDOMAIN_ALIASES.includes(mount.subdomain)
                    ? mount.subdomain
                    : '';
                return (!SUBDOMAIN && !mountSub) || mountSub === SUBDOMAIN || mountSub === '*';
            }).map(mount => {
                // navPrefix: the mount's extra path prefix vs the primary mount,
                // for site-absolute link building (secondary navs that link into
                // sibling patterns mirrored under the same prefix — e.g. primary
                // /freight_data mounted at /fa/freight_data → prefix "/fa", so
                // "/freight_data?cat=…" style links become "/fa/freight_data?…").
                // Primary mounts and mounts that don't extend the primary base
                // get '' — link building is unchanged for them.
                const norm = (u) => `/${(u || '').replace(/^\/|\/$/g, '')}`;
                const primaryBase = norm(pattern.base_url);
                const mountBase = norm(mount.base_url);
                let navPrefix = '';
                if (!mount.isPrimary && mountBase !== primaryBase) {
                    if (primaryBase === '/') navPrefix = mountBase === '/' ? '' : mountBase;
                    else if (mountBase.endsWith(primaryBase)) navPrefix = mountBase.slice(0, mountBase.length - primaryBase.length);
                }
                return { ...mount, navPrefix };
            });
            for (const mount of mounts)
            acc.push(
              ...c.map(config => {
                  const authPermissions = resolveSubdomainAuthPermissions(pattern?.authPermissions, SUBDOMAIN || '');
                  // Don't add the public default for patterns blocked by the server —
                  // their id is 'no-access' (set in the minimal data atom returned for
                  // restricted patterns). Adding public view-page would let isUserAuthed
                  // pass for anonymous users, defeating the auth check in view.jsx.
                  if (pattern?.id !== 'no-access' && !authPermissions?.groups?.public) {
                      authPermissions.groups ??= {};
                      authPermissions.groups.public ??= ['view-page'];
                  }
                  const resolvedFilters = resolveSubdomainFilters(pattern?.filters, SUBDOMAIN || '');
                // Build per-pattern datasources if pattern has dmsEnvId
                const patternDatasources = buildDatasources(pattern);

                const configObj = config({
                    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                    // content identity stays PRIMARY-derived — every mount serves the same pages
                    type: getInstance(pattern.type) || pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                    siteType: siteInstance,
                    baseUrl: `/${mount.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                    adminPath,
                    format: pattern?.config,
                    // downstream link-building reads pattern.base_url — give it this mount's
                    pattern: { ...pattern, base_url: mount.base_url, navPrefix: mount.navPrefix || '', filters: resolvedFilters },
                    pattern_type: pattern?.pattern_type,
                    authPermissions,
                    authBaseUrl,
                    datasources: patternDatasources,
                    dmsEnvs,
                    dmsEnvById,
                    // KEEP: Old variables for other patterns (admin, auth, forms, datasets)
                    pgEnv: pgEnvs?.[0] || '',
                    damaBaseUrl,
                    datasetPatterns,
                    themes,
                    useFalcor,
                    API_HOST,
                    DAMA_HOST,
                    PROJECT_NAME,
                    damaDataTypes,
                    damaMapPlugins,
                    isMultiTenant,
                });
                // console.log('dmssitefactory Config obj', configObj)
                const route = dmsPageFactory({
                    dmsConfig: configObj,
                    API_HOST,
                      DAMA_HOST,
                    authWrapper,
                    isAuth: pattern.pattern_type === 'auth',
                    ErrorBoundary: RootErrorBoundary
                });
                const InnerComponent = route.Component;
                const titleValue = (typeof pattern?.html_title === 'string' && pattern.html_title.trim())
                    || pattern?.name
                    || '';
                return ({
                  ...route,
                  Component: (props) => React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(PatternTitle, { title: titleValue }),
                    React.createElement(InnerComponent, props)
                  )
                })
            }));

            return acc;
        }, []),
    ]
}

// --
// to do:
// Allow users to pass Pattern Configs
// --



// export function pattern2routes (siteData, props) {
//     let {
//         dmsConfig,
//         adminPath = '/list',
//         authPath,
//         authWrapper = withAuth,
//         themes = { default: {} },
//         pgEnvs = [],
//         API_HOST = 'https://graph.availabs.org',
//         DAMA_HOST = 'https://graph.availabs.org',
//         damaBaseUrl,
//         PROJECT_NAME,
//         damaDataTypes,
//         host = typeof window !== 'undefined' ? window.location.host : 'localhost'
//     } = props


//     let SUBDOMAIN = getSubdomain(host)
//     // for weird double subdomain tld
//     SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN

//     const dbThemes = (siteData?.[0]?.theme_refs || [])
//       .reduce((out,theme) => {
//           out[theme.name] = parseIfJSON(theme.theme)
//           return out
//       }, {})
//     //console.log('patterns2routes',dbThemes)

//     themes = themes?.default ? { ...themes, ...dbThemes } : { ...themes, ...dbThemes, default: {} }
//     // console.log('dmsSiteFactory themes', themes)

//     let dmsConfigUpdated = cloneDeep(dmsConfig);
//     const siteType = dmsConfig?.format?.type || dmsConfig.type;
//     dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteType)
//     dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteType)

//     // console.log('dmsConfigUpdated', dmsConfigUpdated)
//     let AdminPattern = {
//       app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
//       type: dmsConfigUpdated.type,
//       doc_type: dmsConfigUpdated.type,
//       siteType: dmsConfigUpdated.type,
//       base_url: adminPath,
//       //format: pattern?.config,
//       pattern: {},
//       pattern_type: 'admin',
//       subdomain: "*",
//       authPermissions: "{}",
//       theme: themes['default'],
//       themes
//     }
//   const patterns = [
//     AdminPattern,
//     ...(siteData
//       .reduce((acc, curr) => [...acc, ...(curr?.patterns || [])], [])
//       || [])
//   ];

//     // Build datasetPatterns once (for backwards compatibility with other patterns)
//     const datasetPatterns = patterns.filter(p => ['forms', 'datasets', 'mapeditor'].includes(p.pattern_type));

//     // Build unified datasources array for page pattern
//     const app = dmsConfigUpdated?.format?.app || dmsConfigUpdated.app;
//     const datasources = [
//       // External sources from pgEnvs (with damaBaseUrl)
//       ...(pgEnvs || []).map(env => ({
//         type: 'external',
//         env,
//         baseUrl: damaBaseUrl || '',
//         label: 'external',
//         srcAttributes: ['name', 'metadata'],
//         viewAttributes: ['version', '_modified_timestamp'],
//       })),
//       // Internal sources from datasetPatterns
//       ...datasetPatterns.map(dsPattern => ({
//         type: 'internal',
//         env: `${app}+${dsPattern.doc_type}`,
//         baseUrl: '/forms',
//         label: 'managed',
//         isDms: true,
//         srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
//         viewAttributes: ['name', 'updated_at'],
//         pattern: dsPattern,
//       }))
//     ];

//     // console.log('dmssite factory, datasources', datasources)

//     return [
//         ...patterns
//           .filter(pattern => (
//               pattern?.pattern_type &&
//               ((!SUBDOMAIN && !pattern.subdomain) || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')
//           ))
//           .reduce((acc, pattern) => {

//             const c = patternTypes[pattern.pattern_type];
//             if(!c) return acc;
//             //console.log('register pattern', pattern.id, pattern.subdomain, `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`)
//             acc.push(
//               ...c.map(config => {
//                   //console.log('dmsSiteFactory authPermissions', pattern?.authPermissions)
//                   const authPermissions = parseIfJSON(pattern?.authPermissions || "{}");
//                   if(!authPermissions?.groups?.public){
//                       // default public permissions. overridden by set permissions
//                       authPermissions.groups ??= {};
//                       authPermissions.groups.public ??= ['view-page'];
//                   }
//                 const configObj = config({
//                     app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
//                     // type: pattern.doc_type,
//                     type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
//                     siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
//                     baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
//                     adminPath,
//                     format: pattern?.config,
//                     pattern: pattern,
//                     pattern_type: pattern?.pattern_type,
//                     authPermissions,
//                     // NEW: Add datasources for page pattern
//                     datasources,
//                     // KEEP: Old variables for other patterns (admin, auth, forms, datasets)
//                     pgEnv: pgEnvs?.[0] || '',
//                     damaBaseUrl,
//                     datasetPatterns,
//                     themes,
//                     useFalcor,
//                     API_HOST,
//                     DAMA_HOST,
//                     PROJECT_NAME,
//                     damaDataTypes,
//                 });
//                 // console.log('dmssitefactory Config obj', configObj)
//                 return ({
//                   ...dmsPageFactory({
//                     dmsConfig: configObj,
//                     API_HOST,
//                     authWrapper,
//                     isAuth: pattern.pattern_type === 'auth',
//                     ErrorBoundary: RootErrorBoundary
//                 })})
//             }));

//             return acc;
//         }, []),
//     ]
// }
