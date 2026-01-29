/**
 * Helper functions for working with the datasources array
 *
 * The datasources array combines what was previously:
 * - pgEnv (external DAMA database environment)
 * - damaBaseUrl (frontend URL for DAMA source links)
 * - datasetPatterns (internal DMS datasets)
 */

/**
 * Get the first external datasource's env (for Falcor queries)
 * Replaces direct usage of pgEnv
 */
export const getExternalEnv = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.env || '';

/**
 * Get the first external datasource's baseUrl (for frontend links)
 * Replaces direct usage of damaBaseUrl
 */
export const getExternalBaseUrl = (datasources) =>
  datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Get baseUrl for a specific source type
 */
export const getBaseUrlByType = (datasources, type) =>
  datasources?.find(ds => ds.type === type)?.baseUrl || '';

/**
 * Get baseUrl from isDms flag (for Attribution component)
 */
export const getBaseUrlFromIsDms = (datasources, isDms) =>
  isDms
    ? datasources?.find(ds => ds.type === 'internal')?.baseUrl || '/forms'
    : datasources?.find(ds => ds.type === 'external')?.baseUrl || '';

/**
 * Filter to external datasources only
 */
export const getExternalDatasources = (datasources) =>
  datasources?.filter(ds => ds.type === 'external') || [];

/**
 * Filter to internal datasources only
 */
export const getInternalDatasources = (datasources) =>
  datasources?.filter(ds => ds.type === 'internal') || [];

/**
 * Find a specific datasource by its env key
 */
export const getDatasourceByEnv = (datasources, env) =>
  datasources?.find(ds => ds.env === env);
