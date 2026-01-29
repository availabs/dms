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

let logFile = null;
let requestCount = 0;

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
      }
    } catch (e) {
      pathSummary = '(parse error)';
    }

    console.log(`[RequestLogger] #${seq} ${methodType.toUpperCase()} ${pathSummary}`);

    // Intercept res.json() to capture the response
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      entry.response = body;
      entry.status = res.statusCode;
      entry.duration = Date.now() - startTime;

      // Log complete entry to file
      try {
        appendFileSync(logFile, JSON.stringify(entry) + '\n');
      } catch (err) {
        console.error('[RequestLogger] Failed to write:', err.message);
      }

      console.log(`[RequestLogger] #${seq} completed (${entry.duration}ms, status ${entry.status})`);

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

        try {
          appendFileSync(logFile, JSON.stringify(entry) + '\n');
        } catch (err) {
          console.error('[RequestLogger] Failed to write:', err.message);
        }

        console.log(`[RequestLogger] #${seq} completed (${entry.duration}ms, status ${entry.status}, no JSON body)`);
      }
    });

    next();
  };
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

module.exports = {
  createRequestLogger,
  getLogFile,
  getRequestCount
};
