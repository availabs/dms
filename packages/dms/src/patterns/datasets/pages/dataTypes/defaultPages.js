/**
 * Built-in page configs that any datasets-pattern dataType can opt into
 * via the `defaultPages: ['table', 'map', 'metadata']` shorthand on its
 * client-side config. Plugins reference these by short name so they
 * never have to deep-import from inside the patterns/datasets tree.
 *
 * Wiring: `siteConfig.jsx` reads each entry of `damaDataTypes`, expands
 * any `defaultPages: [...]` list against this registry, and merges the
 * inflated entries into the dataType config (plugin's own page entries
 * win on conflict).
 *
 * To add a new sharable default page:
 *   1. Author or pick the page component.
 *   2. Add a registry entry below: `<short-name>: { name, path, component, ... }`.
 *   3. Document the new short name in
 *      `dms-template/data-types/CLAUDE.md#defaultPages-shorthand` so
 *      plugin authors know it exists.
 */

import Table from "./gis_dataset/pages/table";
import Map from "./gis_dataset/pages/Map";
import Metadata from "./gis_dataset/pages/metadata";
import SchedulePage from "./schedule/SchedulePage";
import RunsPage from "./schedule/RunsPage";

const defaultPages = {
  table: {
    name: "Table",
    path: "/table",
    component: Table,
  },
  map: {
    name: "Map",
    path: "/map",
    component: Map,
  },
  metadata: {
    name: "Metadata",
    path: "/metadata",
    cdn: () => false,    // hide from nav by default — match existing convention
    component: Metadata,
  },
  // Scheduled data-loader runs (cron authoring) + run history. DAMA-only —
  // schedules live in data_manager.schedules, so hide for internal (DMS)
  // sources. Run detail anchors at source/:id/runs/:taskId (the SourcePage
  // route's third segment carries a task_id here, not a view_id).
  schedule: {
    name: "Schedule",
    path: "/schedule",
    cdn: ({ isDms }) => !isDms,
    component: SchedulePage,
  },
  runs: {
    name: "Runs",
    path: "/runs",
    cdn: ({ isDms }) => !isDms,
    component: RunsPage,
  },
};

/**
 * Expand any `defaultPages: [shortName, ...]` directive on a dataType
 * config into the registered page configs. The original config's own
 * entries take precedence — `defaultPages` only fills in missing keys.
 *
 * Returns a new object; never mutates `config`. Unknown short names
 * are skipped with a console warning so a typo doesn't silently render
 * an empty source view.
 */
export function expandDefaultPages(config) {
  if (!config || !Array.isArray(config.defaultPages) || config.defaultPages.length === 0) {
    return config;
  }
  const expanded = {};
  for (const shortName of config.defaultPages) {
    const entry = defaultPages[shortName];
    if (!entry) {
      console.warn(`[datasets/defaultPages] unknown short name "${shortName}" — known: ${Object.keys(defaultPages).join(', ')}`);
      continue;
    }
    expanded[shortName] = entry;
  }
  // Plugin's own entries win — spread `config` last so it overrides defaults.
  // Strip `defaultPages` itself so it doesn't surface as a nav item.
  const { defaultPages: _strip, ...rest } = config;
  return { ...expanded, ...rest };
}

/**
 * Apply `expandDefaultPages` across an entire `damaDataTypes` map.
 * Returns a new map; safe to call once per render at the merge point
 * in `siteConfig.jsx`.
 */
export function expandDamaDataTypes(damaDataTypes) {
  if (!damaDataTypes) return damaDataTypes;
  const out = {};
  for (const key of Object.keys(damaDataTypes)) {
    out[key] = expandDefaultPages(damaDataTypes[key]);
  }
  return out;
}

export default defaultPages;
