/**
 * Request Logger Middleware
 *
 * Records Falcor requests AND responses to a JSON Lines file for replay in tests.
 * Enable by setting DMS_LOG_REQUESTS=1 environment variable.
 *
 * Usage:
 *   DMS_LOG_REQUESTS=1 npm run dev
 *
 * This creates a file at `logs/requests-<timestamp>.jsonl` with one
 * JSON object per line, each containing:
 *   - seq: Request sequence number
 *   - timestamp: ISO timestamp
 *   - method: HTTP method (GET or POST)
 *   - body: Request body (for POST requests)
 *   - query: Query string parameters (for GET requests)
 *   - response: The JSON response from the API
 *   - status: HTTP status code
 *   - duration: Request duration in milliseconds
 *
 * Falcor parameters (paths, method, callPath, etc.) may be in either
 * body (POST) or query (GET) depending on the request type.
 *
 * To replay in tests, use the test graph harness's respond() method:
 *   const params = entry.method === 'POST' ? entry.body : entry.query;
 *   graph.respond({ queryStringParameters: params }, callback);
 */

const { writeFileSync, appendFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { AsyncLocalStorage } = require('async_hooks');

let logFile = null;
let requestCount = 0;

// Per-request error capture via AsyncLocalStorage.
// Any code (e.g., DB adapters) can call captureQueryError() during a request
// and the error will be included in the JSONL log entry for that request.
const requestStore = new AsyncLocalStorage();

/**
 * Initialize the log file
 */
function initLogFile() {
  if (logFile) return;

  const logsDir = join(__dirname, '../../logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logFile = join(logsDir, `requests-${timestamp}.jsonl`);

  // Write header comment
  writeFileSync(logFile, `# DMS Request Log - ${new Date().toISOString()}\n`);
  console.log(`[RequestLogger] Recording to: ${logFile}`);
}

/**
 * Create the logging middleware
 * Only logs requests to /graph endpoint
 */
function createRequestLogger() {
  const enabled = process.env.DMS_LOG_REQUESTS === '1';

  if (!enabled) {
    // Return no-op middleware
    return (req, res, next) => next();
  }

  initLogFile();

  return function requestLogger(req, res, next) {
    // Only log /graph requests
    if (!req.path.startsWith('/graph')) {
      return next();
    }

    const startTime = Date.now();
    requestCount++;
    const seq = requestCount;

    const entry = {
      seq,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      body: req.body || {},
      query: req.query || {},
      response: null,
      status: null,
      duration: null
    };

    // Falcor params can be in body (POST) or query (GET)
    const params = req.method === 'POST' ? entry.body : entry.query;
    const methodType = params.method || 'unknown';

    // Parse paths for summary
    let pathSummary = 'N/A';
    let callDetail = '';
    try {
      if (params.paths) {
        const paths = typeof params.paths === 'string' ? JSON.parse(params.paths) : params.paths;
        if (Array.isArray(paths) && paths.length > 0) {
          pathSummary = paths.slice(0, 2).map(p => Array.isArray(p) ? p.slice(0, 3).join('.') : String(p)).join(', ');
          if (paths.length > 2) pathSummary += '...';
        }
      } else if (params.callPath) {
        const callPath = typeof params.callPath === 'string' ? JSON.parse(params.callPath) : params.callPath;
        pathSummary = Array.isArray(callPath) ? callPath.join('.') : String(callPath);

        // For CALL requests, log the arguments to show what's being created/edited/deleted
        if (params.arguments) {
          const args = typeof params.arguments === 'string' ? JSON.parse(params.arguments) : params.arguments;
          if (Array.isArray(args) && args.length > 0) {
            const parts = args.map(a => {
              if (typeof a === 'string') return a;
              if (typeof a === 'number') return String(a);
              if (a && typeof a === 'object') {
                // Show key fields for data objects (app, type, id) + truncated preview
                const keys = Object.keys(a);
                const preview = ['app', 'type', 'id'].filter(k => a[k]).map(k => `${k}=${a[k]}`).join(' ');
                return preview || `{${keys.slice(0, 4).join(',')}}`;
              }
              return String(a);
            });
            callDetail = ` args=[${parts.join(', ')}]`;
          }
        }
      }
    } catch (e) {
      pathSummary = '(parse error)';
    }

    // When we can't determine the path, show what keys are in the request body
    if (pathSummary === 'N/A' && methodType !== 'unknown') {
      const bodyKeys = Object.keys(params).filter(k => k !== 'method');
      if (bodyKeys.length > 0) {
        pathSummary = `N/A (body keys: ${bodyKeys.join(', ')})`;
      }
    }

    console.log(`[RequestLogger] #${seq} ${methodType.toUpperCase()} ${pathSummary}${callDetail}`);

    // Intercept res.json() to capture the response
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      entry.response = body;
      entry.status = res.statusCode;
      entry.duration = Date.now() - startTime;

      // Include any query errors captured during this request
      const store = requestStore.getStore();
      if (store?.errors.length) {
        entry.errors = store.errors;
      }

      // Log complete entry to file
      try {
        appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch (err) {
        console.error('[RequestLogger] Failed to write:', err.message);
      }

      const errSuffix = entry.errors ? `, ${entry.errors.length} query error(s)` : '';
      console.log(`[RequestLogger] #${seq} completed (${entry.duration}ms, status ${entry.status}${errSuffix})`);

      // Call original json method
      return originalJson(body);
    };

    // Also handle errors that bypass res.json()
    res.on('finish', () => {
      if (entry.response === null) {
        // Response was sent without using res.json() (e.g., error)
        entry.status = res.statusCode;
        entry.duration = Date.now() - startTime;
        entry.response = { _noJsonBody: true };

        const store = requestStore.getStore();
        if (store?.errors.length) {
          entry.errors = store.errors;
        }

        try {
          appendFileSync(logFile, JSON.stringify(entry) + '\n');
        } catch (err) {
          console.error('[RequestLogger] Failed to write:', err.message);
        }

        const errSuffix = entry.errors ? `, ${entry.errors.length} query error(s)` : '';
        console.log(`[RequestLogger] #${seq} completed (${entry.duration}ms, status ${entry.status}, no JSON body${errSuffix})`);
      }
    });

    // Run the rest of the middleware chain inside the AsyncLocalStorage context
    // so captureQueryError() calls anywhere in the call stack are associated
    // with this request.
    requestStore.run({ errors: [] }, () => next());
  };
}

/**
 * Append an arbitrary entry to the log file.
 * Used by sync diagnostics (ws.js, sync.js) to write to the same file
 * as request logs, giving a unified timeline for debugging.
 *
 * No-op if logging is not enabled (DMS_LOG_REQUESTS !== '1').
 *
 * @param {Object} entry - Object to serialize as a JSON line
 */
function logEntry(entry) {
  if (!logFile) return;
  try {
    appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[RequestLogger] Failed to write:', err.message);
  }
}

/**
 * Whether request logging is enabled.
 */
function isEnabled() {
  return process.env.DMS_LOG_REQUESTS === '1';
}

/**
 * Get the current log file path (for tests or reporting)
 */
function getLogFile() {
  return logFile;
}

/**
 * Get the request count
 */
function getRequestCount() {
  return requestCount;
}

/**
 * Capture a query error for inclusion in the current request's log entry.
 * Safe to call from anywhere in the call stack — if logging is disabled or
 * no request is active, the call is a no-op.
 */
function captureQueryError({ sql, values, error }) {
  const store = requestStore.getStore();
  if (!store) return;
  store.errors.push({
    sql: typeof sql === 'object' ? sql.text : sql,
    values: typeof sql === 'object' ? sql.values : values,
    error: error?.message || String(error),
    code: error?.code,
  });
}

module.exports = {
  createRequestLogger,
  captureQueryError,
  initLogFile,
  logEntry,
  isEnabled,
  getLogFile,
  getRequestCount
};
