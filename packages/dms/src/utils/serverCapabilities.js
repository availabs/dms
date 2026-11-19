// What the dms-server this site talks to supports that an older one does not: `{ [feature]: true }`,
// read once per page load from the Falcor path `dms.capabilities` (api/index.js loadServerCapabilities,
// called by DmsSite at boot). An older server answers an empty atom, so every flag reads as absent.
//
//   reach   `reach: { inherit, override }` in a row's grants is enforced (dms-server routes/auth;
//           src/dms/planning/tasks/current/auth-reach.md). An older server IGNORES `reach`, so a private
//           row would be readable there: a client offers the switches only when this is true.
//
// The store lives here (no Falcor: that stays in api/); components read it with useServerCapabilities().

import { useSyncExternalStore } from 'react';

let capabilities = {};
const listeners = new Set();

export function setServerCapabilities(next) {
    capabilities = next && typeof next === 'object' && !Array.isArray(next) ? { ...next } : {};
    for (const fn of listeners) fn();
}

export function getServerCapabilities() {
    return capabilities;
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function useServerCapabilities() {
    return useSyncExternalStore(subscribe, getServerCapabilities, getServerCapabilities);
}
