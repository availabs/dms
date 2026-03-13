"use strict";
var requestToContext = require("./requestToContext");
var { captureQueryError } = require("../../../middleware/request-logger");
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
            res.status(200).json(jsonGraphEnvelope);
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

        // If the client disconnects, tear down the Observable chain so we
        // don't keep running DB queries and accumulating results in memory.
        req.on('close', function() {
            if (subscription && !subscription.isDisposed) {
                console.log('[falcor-express] Client disconnected, disposing subscription t=%d', Date.now());
                subscription.dispose();
            }
        });
    };
};
