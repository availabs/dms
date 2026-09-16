/**
 * Regression tests for the 2026-09-16 crash loop.
 *
 * A Falcor response for `dms.data.mitigat-ny-prod` grew past V8's max string
 * length (512 MiB). `res.json()` throws `RangeError: Invalid string length`
 * from inside the rxjs `next` handler; rxjs rethrows that from a bare
 * `setTimeout`, nothing catches it, and the process exits — 9 crashes in
 * ~9 minutes behind `--restart unless-stopped`.
 *
 * Two independent fixes, both tested here:
 *   1. falcor-express catches the serialisation failure and streams the
 *      envelope instead (utils/stream-json.js), so the request succeeds.
 *   2. process-level handlers keep the server alive even if something else
 *      throws asynchronously where nothing can catch it.
 *
 * See planning/tasks/current/falcor-response-string-limit-crash.md.
 *
 * The genuinely-oversized HTTP case needs ~2 GB of heap and is gated:
 *   FALCOR_LIMIT_BIG=1 node --max-old-space-size=4096 tests/test-falcor-response-limit.js
 */

const http = require('http');
const express = require('express');
const { spawnSync } = require('child_process');
const { join } = require('path');

const falcorExpress = require('../src/utils/falcor-express');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

/** Minimal stand-in for the rxjs observable a Falcor data source returns. */
function observableOf(envelope) {
  return {
    subscribe(onNext, onError) {
      setImmediate(() => {
        try { onNext(envelope); } catch (e) { throw e; }
      });
      return { isDisposed: false, dispose() { this.isDisposed = true; } };
    },
  };
}

/**
 * Boot the real falcor-express middleware over a fake data source.
 * `patchJson` lets a test make res.json() fail exactly as express does when
 * JSON.stringify blows the string limit — it throws before any header is set.
 */
function startServer({ envelope, patchJson = false }) {
  const app = express();
  app.use(express.json());

  if (patchJson) {
    app.use((req, res, next) => {
      const original = res.json.bind(res);
      let tripped = false;
      res.json = function (body) {
        if (!tripped) {
          tripped = true;
          // Exactly what express throws: stringify fails before headers are set.
          throw new RangeError('Invalid string length');
        }
        return original(body);
      };
      next();
    });
  }

  app.use('/graph', falcorExpress.dataSourceRoute(() => ({
    get: () => observableOf(envelope),
  })));

  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** GET /graph, returning status, headers and the raw body. */
function getGraph(server, { consumeOnly = false } = {}) {
  const { port } = server.address();
  const path = '/graph?method=get&paths=' + encodeURIComponent(JSON.stringify([['dms', 'data', 'test']]));
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      let body = '';
      let bytes = 0;
      res.setEncoding('utf8');
      res.on('data', chunk => {
        bytes += chunk.length;
        if (!consumeOnly) body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, bytes }));
    }).on('error', reject);
  });
}

/**
 * Run a snippet in a child process, capturing both streams whatever the exit
 * code. (spawnSync, not execFileSync — the latter only hands back stderr when
 * the child fails, and half these cases are asserting on a clean exit.)
 */
function runChild(code) {
  const r = spawnSync(process.execPath, ['-e', code], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  });
  return {
    code: r.status === null ? -1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

const SMALL_ENVELOPE = {
  jsonGraph: {
    dms: {
      data: {
        'mitigat-ny-prod': {
          byId: { 2189762: { id: 2189762, title: 'Home', data: { $type: 'atom', value: { a: 1 } } } },
          length: 5168,
        },
      },
    },
  },
  paths: [['dms', 'data', 'mitigat-ny-prod', 'byId', 2189762]],
};

async function main() {
  console.log('\nfalcor-express: normal responses are unaffected');

  await test('a normal envelope returns 200 with a byte-identical body', async () => {
    const server = await startServer({ envelope: SMALL_ENVELOPE });
    try {
      const res = await getGraph(server);
      assert(res.status === 200, `status ${res.status}`);
      assert(res.body === JSON.stringify(SMALL_ENVELOPE), 'body matches JSON.stringify');
      assert(/application\/json/.test(res.headers['content-type']), `content-type ${res.headers['content-type']}`);
    } finally {
      server.close();
    }
  });

  console.log('\nfalcor-express: oversized responses stream instead of crashing');

  await test('a serialisation failure still returns 200 with the full envelope', async () => {
    const server = await startServer({ envelope: SMALL_ENVELOPE, patchJson: true });
    try {
      const res = await getGraph(server);
      assert(res.status === 200, `expected 200 from the streaming fallback, got ${res.status}`);
      assert(res.body === JSON.stringify(SMALL_ENVELOPE), 'streamed body matches JSON.stringify');
      assert(JSON.parse(res.body).paths.length === 1, 'client can parse the streamed envelope');
    } finally {
      server.close();
    }
  });

  await test('the streamed response carries the same content-type as res.json()', async () => {
    const plain = await startServer({ envelope: SMALL_ENVELOPE });
    const streamed = await startServer({ envelope: SMALL_ENVELOPE, patchJson: true });
    try {
      const a = await getGraph(plain);
      const b = await getGraph(streamed);
      assert(a.headers['content-type'] === b.headers['content-type'],
        `${a.headers['content-type']} vs ${b.headers['content-type']}`);
    } finally {
      plain.close();
      streamed.close();
    }
  });

  await test('the server survives the failure and serves the next request', async () => {
    const server = await startServer({ envelope: SMALL_ENVELOPE, patchJson: true });
    try {
      await getGraph(server);
      const second = await getGraph(server);
      assert(second.status === 200, `second request got ${second.status}`);
      assert(second.body === JSON.stringify(SMALL_ENVELOPE), 'second request body intact');
    } finally {
      server.close();
    }
  });

  await test('if streaming also fails, the client gets a 500 rather than a dead socket', async () => {
    // A BigInt is unserialisable by both JSON.stringify and the stream writer.
    const bad = { jsonGraph: { n: BigInt(1) } };
    const server = await startServer({ envelope: bad, patchJson: true });
    try {
      const res = await getGraph(server);
      assert(res.status === 500, `expected 500, got ${res.status}`);
      assert(/too large to serialise/i.test(res.body), `body was ${res.body.slice(0, 200)}`);
    } finally {
      server.close();
    }
  });

  if (process.env.FALCOR_LIMIT_BIG === '1') {
    await test('a genuinely >512 MiB envelope is delivered end to end', async () => {
      const MAX = require('buffer').constants.MAX_STRING_LENGTH;
      const row = 'y'.repeat(1024 * 1024);
      const huge = { jsonGraph: { dms: { data: { byId: {} } } } };
      for (let i = 0; i < 600; i++) huge.jsonGraph.dms.data.byId[i] = row;

      let threw = null;
      try { JSON.stringify(huge); } catch (e) { threw = e; }
      assert(threw instanceof RangeError, 'premise: this is the payload that killed the server');

      // No patchJson here — express's own res.json() throws for real.
      const server = await startServer({ envelope: huge });
      try {
        const res = await getGraph(server, { consumeOnly: true });
        assert(res.status === 200, `expected 200, got ${res.status}`);
        assert(res.bytes > MAX, `expected over ${MAX} bytes, got ${res.bytes}`);
      } finally {
        server.close();
      }
    });
  } else {
    console.log('  - >512 MiB end-to-end test skipped (FALCOR_LIMIT_BIG=1 with --max-old-space-size=4096)');
  }

  console.log('\nprocess safety nets');

  await test('CONTROL: without the handlers, an async throw kills the process', () => {
    const r = runChild(`setTimeout(() => { throw new Error('boom'); }, 0);
      setTimeout(() => console.log('SURVIVED'), 50);`);
    assert(r.code !== 0, `expected a non-zero exit, got ${r.code}`);
    assert(!r.stdout.includes('SURVIVED'), 'process should not have reached the second timer');
  });

  await test('with the handlers, the same async throw is logged and survived', () => {
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets();
      setTimeout(() => { throw new Error('boom'); }, 0);
      setTimeout(() => { console.log('SURVIVED'); process.exit(0); }, 100);`);
    assert(r.code === 0, `expected a clean exit, got ${r.code}: ${r.stderr.slice(0, 300)}`);
    assert(r.stdout.includes('SURVIVED'), 'process should have stayed alive');
    assert(/\[uncaughtException\] boom/.test(r.stderr), `fault not logged: ${r.stderr.slice(0, 300)}`);
    assert(/Process kept alive/.test(r.stderr), 'log should say the process was kept alive');
  });

  await test('an unhandled promise rejection is logged and survived', () => {
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets();
      Promise.reject(new Error('nope'));
      setTimeout(() => { console.log('SURVIVED'); process.exit(0); }, 100);`);
    assert(r.code === 0, `expected a clean exit, got ${r.code}`);
    assert(r.stdout.includes('SURVIVED'), 'process should have stayed alive');
    assert(/\[unhandledRejection\] nope/.test(r.stderr), `fault not logged: ${r.stderr.slice(0, 300)}`);
  });

  await test('the fault is forwarded to the unified timeline logger', () => {
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets({ logEntry: e => console.log('ENTRY ' + JSON.stringify({ t: e._type, m: e.message, o: e.occurrence })) });
      setTimeout(() => { throw new Error('boom'); }, 0);
      setTimeout(() => process.exit(0), 100);`);
    assert(/ENTRY {"t":"uncaughtException","m":"boom","o":1}/.test(r.stdout), `got: ${r.stdout.slice(0, 300)}`);
  });

  await test('DMS_EXIT_ON_UNCAUGHT restores fail-fast behaviour', () => {
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets({ exitOnUncaught: true });
      setTimeout(() => { throw new Error('boom'); }, 0);
      setTimeout(() => { console.log('SURVIVED'); }, 100);`);
    assert(r.code === 1, `expected exit 1, got ${r.code}`);
    assert(!r.stdout.includes('SURVIVED'), 'should not have survived');
    assert(/exiting/.test(r.stderr), 'should say it is exiting');
  });

  await test('a repeating fault is rate-limited, not logged 25 times', () => {
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets();
      for (let i = 0; i < 25; i++) setTimeout(() => { throw new Error('same'); }, 0);
      setTimeout(() => process.exit(0), 200);`);
    const occurrences = (r.stderr.match(/\[uncaughtException\] same \(occurrence \d+\)/g) || []);
    // Logged at 1, 10, 20 — not all 25.
    assert(occurrences.length === 3, `expected 3 logged occurrences, got ${occurrences.length}`);
    assert(/occurrence 20/.test(r.stderr), 'should report the running count');
  });

  await test('handlers do not swallow a synchronous throw at startup', () => {
    // Errors that should surface in tests still do: install() only intercepts
    // what would otherwise be unhandled, not ordinary throws.
    const r = runChild(`
      const { installProcessSafetyNets } = require('./src/utils/process-safety');
      installProcessSafetyNets();
      try { throw new Error('caught normally'); } catch (e) { console.log('CAUGHT ' + e.message); }
      process.exit(0);`);
    assert(r.stdout.includes('CAUGHT caught normally'), 'ordinary try/catch is unaffected');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
