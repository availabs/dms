import React, { useContext, useMemo, useState } from "react";
import { MapContext } from "../index.jsx";
import { ThemeContext, getComponentTheme } from "../../../../../../../../ui/useTheme";
import { damaMapTheme } from "../map.theme";

/**
 * LayerLibraryPanel — the multi-symbology view-mode panel (design: the Freight
 * Atlas map workbench, `dms_design_system_v2/pages/freight-atlas-map.html`).
 * Rendered when `display.layerPanel === 'library'`.
 *
 * Fully themeable: every class comes from the `damaMap.layerLibrary` theme
 * object (patterns/page/defaultTheme.js), read via getComponentTheme with the
 * local default as fallback.
 *
 * Reads/writes ONLY the existing element-data shape:
 *   · categories            = state.tabs[]              ({name, rows:[{name, symbologyId}]})
 *   · row checkbox          = symbologies[id].isVisible (+ each maplibre sub-layer's
 *                             layout.visibility, mirroring map_dama's toggleVisibility)
 *   · per-layer metric      = layer['interactive-filters'] + selectedInteractiveFilterIndex
 *   · ACTIVE MAP list       = rows whose symbology isVisible (category order preserved)
 *
 * Deferred (documented in map-component-unification.md): drag-reorder of active
 * layers, zoom-to-layer, filter-group / view-group selects (no current consumer),
 * search across places (search here is layer-name only).
 */

const ChevronIcon = ({ open, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    {open ? <path d="m4.5 15.75 7.5-7.5 7.5 7.5" /> : <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />}
  </svg>
);

const XIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const getFirstLayer = (symbologyEntry) => {
  const layers = symbologyEntry?.symbology?.layers || {};
  return layers[Object.keys(layers)[0]];
};

const InteractiveFilterSelect = ({ symbologyId, t }) => {
  const { state, setState } = useContext(MapContext);
  const symbologyEntry = state.symbologies?.[symbologyId];
  const layers = symbologyEntry?.symbology?.layers || {};
  const layerWithFilters = Object.values(layers).find(
    (layer) => (layer?.["interactive-filters"] || []).length > 0
  );

  if (!layerWithFilters) return null;

  const filters = layerWithFilters["interactive-filters"];
  const selectedIndex = +layerWithFilters.selectedInteractiveFilterIndex || 0;

  return (
    <div className={t.filterSelectRow}>
      <span className={t.filterSelectLabel}>Show</span>
      <select
        className={t.filterSelect}
        value={selectedIndex}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const nextIndex = parseInt(e.target.value, 10);
          setState((draft) => {
            draft.symbologies[symbologyId].symbology.layers[
              layerWithFilters.id
            ].selectedInteractiveFilterIndex = nextIndex;
          });
        }}
      >
        {filters.map((filter, index) => (
          <option key={index} value={index}>
            {filter.label || filter.name || `Filter ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default function LayerLibraryPanel() {
  const { state, setState } = useContext(MapContext);
  const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const t = {
    ...damaMapTheme.layerLibrary,
    ...getComponentTheme(themeFromContext, "damaMap.layerLibrary"),
  };
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState(null);

  const tabs = state.tabs || [];
  const symbologies = state.symbologies || {};

  const visibleIds = useMemo(
    () => Object.keys(symbologies).filter((id) => symbologies[id]?.isVisible),
    [symbologies]
  );

  // Rows in the ACTIVE MAP strip keep their category grouping order.
  const activeRows = useMemo(
    () =>
      tabs.flatMap((tab) =>
        (tab.rows || [])
          .filter((row) => symbologies[row.symbologyId]?.isVisible)
          .map((row) => ({ ...row, category: tab.name }))
      ),
    [tabs, symbologies]
  );

  // Default-open categories: the ones with something turned on, else the first.
  const openState = useMemo(() => {
    if (openCategories) return openCategories;
    const defaults = {};
    tabs.forEach((tab, index) => {
      const hasVisible = (tab.rows || []).some((row) => symbologies[row.symbologyId]?.isVisible);
      defaults[tab.name || index] = hasVisible || (index === 0 && !visibleIds.length);
    });
    return defaults;
  }, [openCategories, tabs, symbologies, visibleIds]);

  // Sets isVisible and every maplibre sub-layer's layout.visibility together —
  // map_dama's toggleVisibility semantics; interactive variants are re-synced
  // by the interactive-filter flatten effect in index.jsx.
  const setSymbologyVisibility = (symbologyId, nextVisible) => {
    setState((draft) => {
      const entry = draft.symbologies[symbologyId];
      if (!entry) return;
      entry.isVisible = nextVisible;
      Object.values(entry.symbology?.layers || {}).forEach((layer) => {
        (layer.layers || []).forEach((mlLayer) => {
          mlLayer.layout = { ...(mlLayer.layout || {}), visibility: nextVisible ? "visible" : "none" };
        });
      });
    });
  };

  const clearAll = () => {
    visibleIds.forEach((id) => setSymbologyVisibility(id, false));
  };

  const searchTerm = search.trim().toLowerCase();
  const rowMatches = (row) => !searchTerm || (row.name || "").toLowerCase().includes(searchTerm);

  const totalRows = tabs.reduce((count, tab) => count + (tab.rows || []).length, 0);

  return (
    <div className={t.panel}>
      <div className={t.panelInner}>
        <div className={t.header}>
          <span className={t.headerTitle}>Map layers</span>
          <span className={t.headerCount}>{visibleIds.length} on</span>
          <div
            className={t.headerCollapseBtn}
            title={collapsed ? "Expand panel" : "Collapse panel"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronIcon open={!collapsed} className={t.headerCollapseIcon} />
          </div>
        </div>

        {!collapsed && (
          <div className={t.body}>
            <div className={t.searchWrapper}>
              <input
                className={t.searchInput}
                type="text"
                placeholder={`Search ${totalRows} layers…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {activeRows.length > 0 && (
              <div className={t.activeSection}>
                <div className={t.activeSectionHeader}>
                  <span className={t.activeSectionLabel}>Active map</span>
                  <span className={t.activeSectionRule} />
                  <span className={t.activeClearBtn} onClick={clearAll}>Clear all</span>
                </div>
                {activeRows.map((row) => (
                  <div key={`active_${row.symbologyId}`} className={t.activeRow}>
                    <div className={t.activeRowTop}>
                      <div className={t.activeRowInfo}>
                        <div className={t.activeRowName}>
                          {symbologies[row.symbologyId]?.name || row.name}
                        </div>
                        <div className={t.activeRowMeta}>{row.category}</div>
                      </div>
                      <div
                        className={t.activeRowRemove}
                        title="Remove from map"
                        onClick={() => setSymbologyVisibility(row.symbologyId, false)}
                      >
                        <XIcon className={t.activeRowRemoveIcon} />
                      </div>
                    </div>
                    <InteractiveFilterSelect symbologyId={row.symbologyId} t={t} />
                  </div>
                ))}
              </div>
            )}

            <div className={t.libraryHeader}>
              <span className={t.libraryLabel}>Add layers</span>
              <span className={t.libraryRule} />
              <span className={t.libraryMeta}>{tabs.length} categories</span>
            </div>

            {tabs.length === 0 && <div className={t.empty}>No layers configured.</div>}

            {tabs.map((tab, tabIndex) => {
              const tabKey = tab.name || tabIndex;
              const rows = (tab.rows || []).filter(rowMatches);
              if (searchTerm && !rows.length) return null;
              const isOpen = searchTerm ? true : openState[tabKey];
              const onCount = (tab.rows || []).filter(
                (row) => symbologies[row.symbologyId]?.isVisible
              ).length;

              return (
                <div key={tabKey}>
                  <div
                    className={isOpen ? t.categoryHeaderOpen : t.categoryHeader}
                    onClick={() => setOpenCategories({ ...openState, [tabKey]: !isOpen })}
                  >
                    <span className={t.categoryName}>{tab.name || `Category ${tabIndex + 1}`}</span>
                    {onCount > 0 && <span className={t.categoryBadge}>{onCount} on</span>}
                    <span className={t.categoryCount}>{(tab.rows || []).length}</span>
                    <ChevronIcon open={isOpen} className={t.categoryChevron} />
                  </div>
                  {isOpen && (
                    <div className={t.categoryRows}>
                      {rows.map((row) => {
                        const entry = symbologies[row.symbologyId];
                        if (!entry) return null;
                        const isVisible = Boolean(entry.isVisible);
                        const firstLayer = getFirstLayer(entry);
                        const filterCount = (firstLayer?.["interactive-filters"] || []).length;
                        return (
                          <label
                            key={row.symbologyId}
                            className={isVisible ? t.rowActive : t.row}
                          >
                            <input
                              type="checkbox"
                              className={t.rowCheckbox}
                              checked={isVisible}
                              onChange={() => setSymbologyVisibility(row.symbologyId, !isVisible)}
                            />
                            <span className={t.rowName}>{entry.name || row.name}</span>
                            {filterCount > 1 && (
                              <span className={t.rowHint}>{filterCount} views</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
