// The host's own React, react-dom, JSX runtime and router, handed to plugins loaded at run time.
//
// Task: src/dms/planning/tasks/current/dms-plugin-system.md, P2 ("plugins reach the host's React through a global").
// A plugin is built with those imports mapped to shim modules (`dms plugin build`) that read this global, so a page
// has one React and the plugin's hooks and contexts are the host's. Loaded (by plugins/load.js) only when a site has
// a plugin to load, so a site without one downloads nothing more. The same in Node for the server render.
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactRouter from 'react-router'

export const PEERS_GLOBAL = '__DMS_PLUGIN_PEERS__'

// The specifiers a plugin may import from the host (the `dms plugin build` shims cover exactly these).
export const PEER_SPECIFIERS = ['react', 'react-dom', 'react/jsx-runtime', 'react-router']

/** Sets the global once and returns it. */
export function sharePeers() {
  if (!globalThis[PEERS_GLOBAL]) {
    globalThis[PEERS_GLOBAL] = Object.freeze({
      react: React,
      'react-dom': ReactDOM,
      'react/jsx-runtime': JsxRuntime,
      'react-router': ReactRouter,
    })
  }
  return globalThis[PEERS_GLOBAL]
}
