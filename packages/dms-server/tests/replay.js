/**
 * Request Replay Utility
 *
 * Replays recorded Falcor requests from a JSONL log file against the test graph.
 * Useful for reproducing issues captured in production or development.
 *
 * Usage:
 *   node tests/replay.js logs/requests-2026-01-28T12-00-00-000Z.jsonl
 *
 * Or programmatically:
 *   const { replayFile } = require('./replay');
 *   await replayFile('logs/requests.jsonl');
 */

const { readFileSync } = require('fs');
const { createTestGraph } = require('./graph');

/**
 * Parse a JSONL log file
 * @param {string} filePath - Path to the JSONL file
 * @returns {Array} Array of request objects
 */
function parseLogFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.warn(`Skipping invalid line ${i + 1}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Replay a single request
 * @param {Object} graph - Test graph instance
 * @param {Object} entry - Request log entry
 * @returns {Promise<Object>} - Response from the graph
 */
async function replayRequest(graph, entry) {
  return new Promise((resolve, reject) => {
    // Falcor params are in body for POST, query for GET
    const params = entry.method === 'POST' ? entry.body : entry.query;

    graph.respond({ queryStringParameters: params || {} }, (error, result) => {
      if (error) {
        resolve({ error, entry });
      } else {
        resolve({ result, entry });
      }
    });
  });
}

/**
 * Replay all requests from a log file
 * @param {string} filePath - Path to the JSONL file
 * @param {Object} options - Replay options
 * @param {string} options.dbName - Database config name (default: 'dms-sqlite')
 * @param {boolean} options.stopOnError - Stop on first error (default: false)
 * @param {boolean} options.verbose - Log each request (default: true)
 * @returns {Promise<Object>} - Summary of replay results
 */
async function replayFile(filePath, options = {}) {
  const {
    dbName = 'dms-sqlite',
    stopOnError = false,
    verbose = true
  } = options;

  console.log(`\n=== Replaying requests from: ${filePath} ===\n`);

  const entries = parseLogFile(filePath);
  console.log(`Found ${entries.length} requests\n`);

  const graph = createTestGraph(dbName);

  const results = {
    total: entries.length,
    success: 0,
    errors: [],
    responses: []
  };

  for (const entry of entries) {
    if (verbose) {
      const methodType = entry.body?.method || 'unknown';
      console.log(`#${entry.seq} ${methodType.toUpperCase()} ...`);
    }

    const response = await replayRequest(graph, entry);

    if (response.error) {
      results.errors.push({
        seq: entry.seq,
        error: response.error.message || response.error
      });

      if (verbose) {
        console.log(`  ERROR: ${response.error.message || response.error}`);
      }

      if (stopOnError) {
        console.log('\nStopping on error.');
        break;
      }
    } else {
      results.success++;
      results.responses.push(response.result);

      if (verbose) {
        console.log(`  OK`);
      }
    }
  }

  console.log(`\n=== Replay complete ===`);
  console.log(`Total: ${results.total}, Success: ${results.success}, Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => console.log(`  #${e.seq}: ${e.error}`));
  }

  return results;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node tests/replay.js <logfile.jsonl>');
    console.log('');
    console.log('Options (via env vars):');
    console.log('  DB_NAME=dms-sqlite     Database config to use');
    console.log('  STOP_ON_ERROR=1        Stop on first error');
    console.log('  QUIET=1                Suppress per-request output');
    process.exit(1);
  }

  const filePath = args[0];
  const options = {
    dbName: process.env.DB_NAME || 'dms-sqlite',
    stopOnError: process.env.STOP_ON_ERROR === '1',
    verbose: process.env.QUIET !== '1'
  };

  replayFile(filePath, options)
    .then(results => {
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Replay failed:', err);
      process.exit(1);
    });
}

module.exports = { parseLogFile, replayRequest, replayFile };
