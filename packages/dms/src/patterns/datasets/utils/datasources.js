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
export const buildEnvsForListing = (datasources, format) => {
  const envs = {};

  // Add external datasources (if any exist)
  datasources?.filter(ds => ds.type === 'external').forEach(ds => {
    envs[ds.env] = {
      label: ds.label,
      srcAttributes: ['name', 'type', 'metadata', 'categories', 'description'],
      viewAttributes: ds.viewAttributes,
    };
  });

  // Always add internal env from format (current pattern's internal sources)
  if (format?.app && format?.type) {
    envs[`${format.app}+${format.type}`] = {
      label: 'managed',
      isDms: true,
      srcAttributes: ['app', 'name', 'type', 'doc_type', 'config', 'default_columns', 'categories', 'description'],
      viewAttributes: ['name', 'updated_at'],
    };
  }

  return envs;
};
