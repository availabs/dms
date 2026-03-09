/**
 * Reactive Query Hook
 *
 * React hook that runs SQL against local SQLite and auto-invalidates
 * when sync changes arrive. Enhanced with scoped invalidation.
 *
 * Port from research/toy-sync/client/use-query.js with scoped invalidation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { exec } from './db-client.js';
import { onInvalidate } from './sync-manager.js';

/**
 * Run a SQL query against local SQLite, re-run on invalidation.
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {Array} deps - React effect dependencies (re-run query when these change)
 * @param {string} [scope] - Invalidation scope (e.g., 'data_items:myapp+docs-page').
 *   If omitted, query re-runs on ANY invalidation. If provided, only re-runs
 *   when invalidation matches this scope or a parent scope.
 */
export function useQuery(sql, params = [], deps = [], scope = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const sqlRef = useRef(sql);
  const paramsRef = useRef(params);

  sqlRef.current = sql;
  paramsRef.current = params;

  const runQuery = useCallback(async () => {
    try {
      const result = await exec(sqlRef.current, paramsRef.current);
      if (mountedRef.current) {
        setData(result.rows);
        setLoading(false);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    runQuery();

    const unsub = onInvalidate((invalidatedScope) => {
      if (!scope) {
        // No scope filter — re-run on any invalidation
        runQuery();
        return;
      }
      // Match if invalidation is parent scope (e.g., 'data_items' matches 'data_items:app+type')
      // or exact match
      if (invalidatedScope === scope || scope.startsWith(invalidatedScope)) {
        runQuery();
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, deps);

  return { data, loading, error, refetch: runQuery };
}
