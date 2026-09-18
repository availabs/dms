"use strict";

/**
 * Process-level safety nets.
 *
 * Node's default for an uncaught exception is to print it and exit. That is how
 * a single oversized Falcor response killed the server on 2026-09-16: rxjs
 * catches a synchronous throw inside a subscriber and rethrows it from a bare
 * `setTimeout(function () { throw err; })` (rxjs/observable/PromiseObservable.js),
 * which no try/catch, express error handler, or promise rejection handler can
 * reach. One request that could not be serialised took the whole process down,
 * the container restarted, the client retried, and it crash-looped — 9 crashes
 * in ~9 minutes.
 *
 * See planning/tasks/current/falcor-response-string-limit-crash.md.
 *
 * THE DELIBERATE DECISION: LOG LOUDLY, DO NOT EXIT.
 *
 * The standard argument against this is that an uncaught exception may leave
 * corrupt state behind, so exiting is safer. That does not hold here. This
 * process is a stateless request/response server — durable state lives in
 * Postgres, and a request that threw has already been abandoned by the time we
 * get here. Set against that, the default behaviour is *guaranteed* harm: every
 * in-flight request for every user dies, all WebSocket sync clients reconnect,
 * and the fault repeats on the next retry. Staying up degrades one request
 * instead of all of them.
 *
 * Set DMS_EXIT_ON_UNCAUGHT=1 to restore fail-fast behaviour — useful locally,
 * where a loud crash is more informative than a log line, and available as an
 * escape hatch if a fault ever does prove genuinely unrecoverable.
 */

/**
 * @param {Object} [options]
 * @param {(entry: Object) => void} [options.logEntry] - unified-timeline logger
 * @param {boolean} [options.exitOnUncaught] - defaults to DMS_EXIT_ON_UNCAUGHT=1
 * @returns {() => void} uninstall function (used by tests)
 */
function installProcessSafetyNets(options = {}) {
  const exitOnUncaught = options.exitOnUncaught !== undefined
    ? options.exitOnUncaught
    : process.env.DMS_EXIT_ON_UNCAUGHT === '1';
  const logEntry = options.logEntry || function () {};

  // A tight throw loop must not fill the disk with identical stack traces, so
  // repeats of the same message are counted and reported at milestones instead.
  const faultCounts = new Map();

  function reportFault(kind, err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const key = kind + ':' + message;
    const count = (faultCounts.get(key) || 0) + 1;
    faultCounts.set(key, count);

    // Full detail the first time, then every 10th up to 100, then every 100th.
    const milestone = count === 1 || count % (count < 100 ? 10 : 100) === 0;
    if (milestone) {
      console.error(`[${kind}] ${message} (occurrence ${count})`);
      if (stack) console.error(stack);
      console.error(`[${kind}] Process kept alive. Set DMS_EXIT_ON_UNCAUGHT=1 to exit instead.`);
    }

    try {
      logEntry({
        _type: kind,
        timestamp: new Date().toISOString(),
        message,
        stack,
        occurrence: count,
      });
    } catch (logErr) {
      console.error(`[${kind}] Failed to log fault:`, logErr.message);
    }

    if (exitOnUncaught) {
      console.error(`[${kind}] DMS_EXIT_ON_UNCAUGHT=1 — exiting.`);
      process.exit(1);
    }
  }

  const onException = (err) => reportFault('uncaughtException', err);
  const onRejection = (reason) => reportFault('unhandledRejection', reason);

  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);

  return function uninstall() {
    process.removeListener('uncaughtException', onException);
    process.removeListener('unhandledRejection', onRejection);
  };
}

module.exports = { installProcessSafetyNets };
