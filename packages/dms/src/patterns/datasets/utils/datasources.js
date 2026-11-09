import { getInstance as extractInstance } from '../../../utils/type-utils';

/**
 * Get the first external datasource's env (for Falcor queries)
 * Returns '' if no external datasources configured - callers must guard against this
 */
export const getExternalEnv = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.env || '';

/**
 * Get the first external datasource's baseUrl (for frontend links)
 * Returns '' if no external datasources configured
 */
export const getExternalBaseUrl = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Check if any external datasources are configured
 */
export const hasExternalDatasources = (datasources) =>
  datasources?.some(ds => ds.type === 'external') || false;

/**
 * Build envs object for source listing (used by DatasetsListComponent)
 * Combines external datasources with internal format-based env.
 * When no external datasources exist, only internal sources are listed.
 */
export const buildEnvsForListing = (datasources, format, dmsEnv, dmsEnvs = []) => {
  const envs = {};

  // Add external datasources (if any exist) — unless the site MIRRORS the pgEnv (a `:dmsenv` row naming
  // it, dms-server dama/mirror.js): its sources then list through the internal env below, as rows of
  // this site, and listing the pgEnv too would show each one twice.
  // Listing-only attributes: don't pull `metadata` (full column-definition
  // blob) — the list UI only renders name/type/categories/description, and
  // `metadata` is tens of KB per source on DAMA tables.
  const mirrored = new Set((dmsEnvs || []).map(e => e?.pgEnv).filter(Boolean));
  datasources?.filter(ds => ds.type === 'external' && !mirrored.has(ds.env)).forEach(ds => {
    envs[ds.env] = {
      label: ds.label,
      srcAttributes: ['name', 'type', 'categories', 'description'],
      viewAttributes: ds.viewAttributes,
    };
  });

  // Add internal env for source listing.
  // UDA's getSitePatterns matches patterns by instance segment in the type
  // column. format.type may include a suffix like '|source' from
  // initializePatternFormat, so strip everything after the first '|' to get
  // the pattern instance name. When dmsEnv is available, use the pattern
  // instance (not dmsEnv instance) because UDA resolves sources through
  // pattern → dmsEnvId → dmsEnv.sources chain.
  //
  // Listing-only attributes: no `config`/`default_columns` — those are large
  // JSON blobs and are never consumed by the list component.
  if (format?.app && format?.type) {
    const patternInstance = format.type.split('|')[0];
    envs[`${format.app}+${patternInstance}`] = {
      label: 'managed',
      isDms: true,
      // `pgEnv` + `source_id` mark a MIRROR of a pgEnv source: the list links it to the external
      // source page by the pgEnv's own id (DatasetsList getSources)
      srcAttributes: ['app', 'name', 'type', 'categories', 'description', 'pgEnv', 'source_id'],
      viewAttributes: ['name', 'updated_at'],
    };
  }

  return envs;
};
