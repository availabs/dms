// test-worker-env.js: reports the names (never the values) of the environment this process was forked with
process.send(Object.keys(process.env), () => process.exit(0));
