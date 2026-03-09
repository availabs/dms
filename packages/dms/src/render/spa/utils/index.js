import { cloneDeep } from "lodash-es"
import { useFalcor } from "@availabs/avl-falcor"
import { withAuth,  dmsPageFactory } from '../../../'
import { parseIfJSON } from '../../../patterns/page/pages/_utils';
import patternTypes from '../../../patterns'
import { updateAttributes, updateRegisteredFormats } from "../../../dms-manager/_utils";
import RootErrorBoundary from './RootErrorBoundary'


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
        host = typeof window !== 'undefined' ? window.location.host : 'localhost'
    } = props


    let SUBDOMAIN = getSubdomain(host)
    // for weird double subdomain tld
    SUBDOMAIN = SUBDOMAIN === 'hazardmitigation' ? '' : SUBDOMAIN

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
    dmsConfigUpdated.registerFormats = updateRegisteredFormats(dmsConfigUpdated.registerFormats, dmsConfig.app, siteType)
    dmsConfigUpdated.attributes = updateAttributes(dmsConfigUpdated.attributes, dmsConfig.app, siteType)

    // console.log('dmsConfigUpdated', dmsConfigUpdated)
    let AdminPattern = {
      app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
      type: dmsConfigUpdated.type,
      doc_type: dmsConfigUpdated.type,
      siteType: dmsConfigUpdated.type,
      base_url: adminPath,
      //format: pattern?.config,
      pattern: {},
      pattern_type: 'admin',
      subdomain: "*",
      authPermissions: "{}",
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

    // Build unified datasources array for page pattern
    const app = dmsConfigUpdated?.format?.app || dmsConfigUpdated.app;
    const datasources = [
      // External sources from pgEnvs (with damaBaseUrl)
      ...(pgEnvs || []).map(env => ({
        type: 'external',
        env,
        baseUrl: damaBaseUrl || '',
        label: 'external',
        srcAttributes: ['name', 'metadata'],
        viewAttributes: ['version', '_modified_timestamp'],
      })),
      // Internal sources from datasetPatterns
      ...datasetPatterns.map(dsPattern => ({
        type: 'internal',
        env: `${app}+${dsPattern.doc_type}`,
        baseUrl: '/forms',
        label: 'managed',
        isDms: true,
        srcAttributes: ['app', 'name', 'doc_type', 'config', 'default_columns'],
        viewAttributes: ['name', 'updated_at'],
        pattern: dsPattern,
      }))
    ];

    // console.log('dmssite factory, datasources', datasources)

    return [
        ...patterns
          .filter(pattern => (
              pattern?.pattern_type &&
              ((!SUBDOMAIN && !pattern.subdomain) || pattern.subdomain === SUBDOMAIN || pattern.subdomain === '*')
          ))
          .reduce((acc, pattern) => {

            const c = patternTypes[pattern.pattern_type];
            if(!c) return acc;
            //console.log('register pattern', pattern.id, pattern.subdomain, `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`)
            acc.push(
              ...c.map(config => {
                  const authPermissions = resolveSubdomainAuthPermissions(pattern?.authPermissions, SUBDOMAIN || '');
                  if (!authPermissions?.groups?.public) {
                      authPermissions.groups ??= {};
                      authPermissions.groups.public ??= ['view-page'];
                  }
                  const resolvedFilters = resolveSubdomainFilters(pattern?.filters, SUBDOMAIN || '');
                const configObj = config({
                    app: dmsConfigUpdated?.format?.app || dmsConfigUpdated.app,
                    // type: pattern.doc_type,
                    type: pattern.doc_type || pattern?.base_url?.replace(/\//g, ''),
                    siteType: dmsConfigUpdated?.format?.type || dmsConfigUpdated.type,
                    baseUrl: `/${pattern.base_url?.replace(/^\/|\/$/g, '')}`, // only leading slash allowed
                    adminPath,
                    format: pattern?.config,
                    pattern: { ...pattern, filters: resolvedFilters },
                    pattern_type: pattern?.pattern_type,
                    authPermissions,
                    // NEW: Add datasources for page pattern
                    datasources,
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
                });
                // console.log('dmssitefactory Config obj', configObj)
                return ({
                  ...dmsPageFactory({
                    dmsConfig: configObj,
                    API_HOST,
                    authWrapper,
                    isAuth: pattern.pattern_type === 'auth',
                    ErrorBoundary: RootErrorBoundary
                })})
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
