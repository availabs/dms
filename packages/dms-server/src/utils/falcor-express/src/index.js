"use strict";
var requestToContext = require("./requestToContext");
var { captureQueryError } = require("../../../middleware/request-logger");
var writeJson = require("../../stream-json");
var FalcorEndpoint = module.exports = {};

FalcorEndpoint.expressMiddleware = function(getDataSource) {
    console.warn("expressMiddleware is deprecated, use dataSourceRoute instead");
    this.dataSourceRoute(getDataSource);
};

FalcorEndpoint.dataSourceRoute = function(getDataSource) {
    return function(req, res, next) {
        var obs;
        var dataSource;
        try {
            dataSource = getDataSource(req, res);
        } catch (e) {
            console.error('[falcor-express] getDataSource threw:', e);
            captureQueryError({ sql: 'getDataSource', error: e });
            return res.status(500).json({ error: 'Error creating data source', message: e.message });
        }
        if (!dataSource) {
            console.error('[falcor-express] getDataSource returned falsy value');
            return res.status(500).json({ error: 'No data source available' });
        }
        var context = requestToContext(req);
        req._falcorContext = context; // for request logger
        // probably this should be sanity check function?
        if (Object.keys(context).length === 0) {
            return res.status(500).json({ error: "Request not supported" });
        }
        if (typeof context.method === "undefined" || context.method.length === 0) {
            return res.status(500).json({ error: "No query method provided" });
        }
        if (typeof dataSource[context.method] === "undefined") {
            return res.status(500).json({ error: "Data source does not implement the requested method" });
        }

        if (context.method === "call") {
            console.log('[falcor-express] CALL', JSON.stringify(context.callPath), 'args:', JSON.stringify(context.arguments)?.slice(0, 200));
        }

        try {
            if (context.method === "set") {
                obs = dataSource[context.method](context.jsonGraph);
            } else if (context.method === "call") {
                obs = dataSource[context.method](context.callPath, context.arguments, context.pathSuffixes, context.paths);
            } else {
                obs = dataSource[context.method]([].concat(context.paths));
            }
        } catch (e) {
            console.error('[falcor-express] Error creating observable:', e);
            captureQueryError({ sql: 'falcor-dispatch:' + context.method, error: e });
            return res.status(500).json({ error: e.message });
        }

        if (!obs || typeof obs.subscribe !== 'function') {
            console.error('[falcor-express] dataSource.' + context.method + ' did not return an observable');
            return res.status(500).json({ error: 'Internal error: no observable' });
        }

        var subscription = obs.subscribe(function(jsonGraphEnvelope) {
            if (context.method === "call") {
                console.log('[falcor-express] CALL response ready:', JSON.stringify(context.callPath), 'headersSent=%s t=%d', res.headersSent, Date.now());
            }
            if (res.headersSent) {
                console.error('[falcor-express] Headers already sent, cannot send response');
                return;
            }
            try {
                res.status(200).json(jsonGraphEnvelope);
            } catch (e) {
                // res.json() stringifies the whole envelope, so a response over
                // V8's max string length (512 MiB) throws RangeError: Invalid
                // string length. This handler is NOT the observable's error
                // callback below — rxjs's SafeSubscriber rethrows a synchronous
                // throw from here via a bare setTimeout, which nothing catches
                // and which therefore killed the process.
                //
                // express stringifies before it sets any header, so nothing has
                // been written yet and the same envelope can still go out the
                // door — streamed in chunks, the way /sync/bootstrap sends its
                // 1.19GB payload (routes/sync/sync.js).
                console.error('[falcor-express] res.json() failed (' + e.message + '), streaming envelope instead');
                captureQueryError({ sql: 'falcor-serialise:' + (context.method || 'unknown'), error: e });
                try {
                    res.status(200);
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    var written = writeJson(res, jsonGraphEnvelope);
                    res.end();
                    console.log('[falcor-express] Streamed oversized response: %d chars', written);
                } catch (streamErr) {
                    console.error('[falcor-express] Streaming fallback failed:', streamErr.message);
                    if (streamErr.stack) console.error(streamErr.stack);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Response too large to serialise', message: e.message });
                    } else {
                        res.end();
                    }
                }
            }
        }, function(err) {
            var message = err instanceof Error ? err.message : String(err);
            var stack = err instanceof Error ? err.stack : undefined;
            console.error('[falcor-express] Route error:', message);
            if (stack) console.error(stack);
            captureQueryError({ sql: 'falcor-route:' + (context.method || 'unknown'), error: err });
            // Guard against headers-already-sent (e.g., client disconnected)
            if (!res.headersSent) {
              res.status(500).json({ error: message });
            }
        });

        // If the client disconnects before we send a response, tear down
        // the Observable chain so we don't keep running DB queries.
        // Use res 'close' (not req 'close') — in Node.js v15+ req emits
        // 'close' after the request body is consumed, which is before async
        // routes finish. res 'close' fires when the connection actually ends.
        res.on('close', function() {
            if (subscription && !subscription.isDisposed && !res.writableFinished) {
                console.log('[falcor-express] Client disconnected, disposing subscription t=%d', Date.now());
                subscription.dispose();
            }
        });
    };
};
