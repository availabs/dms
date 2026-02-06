/**
 * Lightweight Falcor client for Node.js
 *
 * Implements the same interface as @availabs/avl-falcor so the shared
 * API functions (dmsDataLoader, dmsDataEditor) work unchanged.
 */

/**
 * Unwrap Falcor JSON Graph values
 * Handles $atom, $ref, $error sentinel types
 */
function unwrapValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Handle Falcor sentinel types
  if (value.$type === 'atom') return value.value;
  if (value.$type === 'error') throw new Error(value.value?.message || 'Falcor error');
  if (value.$type === 'ref') return value; // Keep refs for resolution

  return value;
}

/**
 * Resolve a path through the JSON Graph, following $ref pointers
 */
function resolvePath(graph, path) {
  let current = graph;

  for (const key of path) {
    if (current === null || current === undefined) return undefined;

    current = current[key];

    // Follow $ref pointers
    if (current && current.$type === 'ref') {
      current = resolvePath(graph, current.value);
    }
  }

  return unwrapValue(current);
}

/**
 * Get a value from the cache by path
 */
function getFromCache(cache, path) {
  return resolvePath(cache, path);
}

/**
 * Deep merge JSON Graph into cache
 */
function mergeIntoCache(cache, graph) {
  for (const [key, value] of Object.entries(graph)) {
    if (value && typeof value === 'object' && !value.$type) {
      if (!cache[key]) cache[key] = {};
      mergeIntoCache(cache[key], value);
    } else {
      cache[key] = value;
    }
  }
}

/**
 * Create a Falcor client for the CLI
 *
 * @param {string} host - API host URL (e.g., 'http://localhost:4444')
 * @param {string} [authToken] - Optional auth token
 * @returns {Object} - Falcor-compatible client with get(), call(), getCache(), invalidate()
 */
export function createFalcorClient(host, authToken) {
  // Internal cache to store fetched data
  let cache = {};

  /**
   * Make a request to the Falcor endpoint
   */
  async function request(method, body) {
    const url = `${host}/graph`;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (error) {
      if (error.cause?.code === 'ECONNREFUSED') {
        throw new Error(`Connection refused: ${host}\nIs the DMS server running? Check --host option.`);
      }
      throw new Error(`Connection failed to ${host}: ${error.message}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falcor request failed (${response.status}): ${text}`);
    }

    const result = await response.json();

    if (result.jsonGraph) {
      mergeIntoCache(cache, result.jsonGraph);
    }

    return result;
  }

  return {
    /**
     * Fetch data by paths
     * @param {...Array} paths - Falcor paths to fetch
     * @returns {Object} - { json: { ... } }
     */
    async get(...paths) {
      const pathsJson = JSON.stringify(paths);
      const body = `method=get&paths=${encodeURIComponent(pathsJson)}`;

      await request('get', body);

      // Build response in the format expected by dmsDataLoader
      // It expects { json: { path1: value1, path2: value2, ... } }
      const json = {};

      for (const path of paths) {
        // Handle paths with ranges like { from: 0, to: 10 }
        const expandedPaths = expandPath(path);

        for (const p of expandedPaths) {
          let current = json;
          for (let i = 0; i < p.length - 1; i++) {
            const key = p[i];
            if (!current[key]) current[key] = {};
            current = current[key];
          }
          const lastKey = p[p.length - 1];

          // If last element is an array of attributes, fetch each
          if (Array.isArray(lastKey)) {
            for (const attr of lastKey) {
              const fullPath = [...p.slice(0, -1), attr];
              current[attr] = getFromCache(cache, fullPath);
            }
          } else {
            current[lastKey] = getFromCache(cache, p);
          }
        }
      }

      return { json };
    },

    /**
     * Call a Falcor function
     * @param {Array} callPath - Path to the function
     * @param {Array} args - Arguments to pass
     * @returns {Object} - { json: { ... } }
     */
    async call(callPath, args = []) {
      const callPathJson = JSON.stringify(callPath);
      const argsJson = JSON.stringify(args);
      const body = `method=call&callPath=${encodeURIComponent(callPathJson)}&arguments=${encodeURIComponent(argsJson)}`;

      const result = await request('call', body);

      return { json: result.jsonGraph || {} };
    },

    /**
     * Get the current cache
     * @returns {Object} - The internal cache
     */
    getCache() {
      return cache;
    },

    /**
     * Invalidate cache entries
     * @param {...Array} paths - Paths to invalidate
     */
    invalidate(...paths) {
      // For simplicity, just clear the whole cache
      // A more sophisticated implementation would selectively clear paths
      cache = {};
    },
  };
}

/**
 * Expand a Falcor path that may contain ranges
 * e.g., ['dms', 'data', 'byIndex', { from: 0, to: 2 }]
 *    -> [['dms', 'data', 'byIndex', 0], ['dms', 'data', 'byIndex', 1], ['dms', 'data', 'byIndex', 2]]
 */
function expandPath(path) {
  const results = [[]];

  for (const segment of path) {
    if (segment && typeof segment === 'object' && 'from' in segment && 'to' in segment) {
      // Range segment - expand it
      const newResults = [];
      for (let i = segment.from; i <= segment.to; i++) {
        for (const r of results) {
          newResults.push([...r, i]);
        }
      }
      results.length = 0;
      results.push(...newResults);
    } else {
      // Normal segment - append to all results
      for (const r of results) {
        r.push(segment);
      }
    }
  }

  return results;
}

export default createFalcorClient;
