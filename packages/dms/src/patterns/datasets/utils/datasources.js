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
export const buildEnvsForListing = (datasources, format, dmsEnv) => {
  const envs = {};

  // Add external datasources (if any exist)
  datasources?.filter(ds => ds.type === 'external').forEach(ds => {
    envs[ds.env] = {
      label: ds.label,
      srcAttributes: ['name', 'type', 'metadata', 'categories', 'description'],
      viewAttributes: ds.viewAttributes,
    };
  });

  // Add internal env for source listing.
  // UDA's getSitePatterns searches for patterns where type LIKE '%{docType}%'.
  // format.type may include a suffix like '|source' from initializePatternFormat,
  // so strip everything after the first '|' to get the pattern instance name.
  // When dmsEnv is available, use the pattern instance (not dmsEnv instance)
  // because UDA resolves sources through pattern → dmsEnvId → dmsEnv.sources chain.
  if (format?.app && format?.type) {
    const patternInstance = format.type.split('|')[0];
    envs[`${format.app}+${patternInstance}`] = {
      label: 'managed',
      isDms: true,
      srcAttributes: ['app', 'name', 'type', 'config', 'default_columns', 'categories', 'description'],
      viewAttributes: ['name', 'updated_at'],
    };
  }

  return envs;
};
