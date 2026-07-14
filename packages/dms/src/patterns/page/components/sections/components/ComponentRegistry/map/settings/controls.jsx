import React, { useContext } from "react";

import { ThemeContext, getComponentTheme } from "../../../../../../../../ui/useTheme";
import useMapSettingsControls from "./state.jsx";
import { getSymbologyBridge, listBridgeSymbologies } from "./filters.jsx";

const Field = ({ label, children, compact = false, labelClassName }) => (
  <div className={`${compact ? "pb-1.5" : "pb-2"} w-full min-w-0`}>
    <label className={labelClassName}>{label}</label>
    {children}
  </div>
);

const StaticFieldValue = ({ value, valueClassName, fieldPanelClassName }) => (
  <div className={`mt-1 min-h-9 rounded-md border px-3 py-2 text-sm leading-5 break-words flex items-center ${fieldPanelClassName} ${valueClassName}`}>
    {value}
  </div>
);

const InlineField = ({ label, children, border = true, alignStart = false, labelClassName, dividerClassName }) => (
  <div className={`${border ? `border-t ${dividerClassName}` : ""} flex w-full items-center justify-between gap-3 py-2`}>
    <label className={`min-w-0 flex-1 ${labelClassName} ${alignStart ? "self-start pt-1" : ""}`}>{label}</label>
    <div className={`${alignStart ? "pt-0" : ""} ml-auto min-w-0 flex-shrink-0`}>
      {children}
    </div>
  </div>
);

const ToggleRow = ({ label, value, onChange, border = true, labelClassName, SwitchComp, dividerClassName }) => (
  <div className={`${border ? `border-t ${dividerClassName}` : ""} flex w-full items-center justify-between gap-3 py-2`}>
    <span className={`${labelClassName} min-w-0 flex-1`}>{label}</span>
    <div className="ml-auto flex-shrink-0">
      {SwitchComp ? <SwitchComp enabled={Boolean(value)} setEnabled={onChange} size="small" /> : null}
    </div>
  </div>
);

const FilterGroup = ({ title, children, highlighted = false, titleClassName, fieldPanelClassName, highlightedPanelClassName }) => (
  <div className={`w-full rounded-md px-3 py-3 border ${highlighted ? highlightedPanelClassName : fieldPanelClassName}`}>
    {title ? <div className={`pb-2 ${titleClassName}`}>{title}</div> : null}
    {children}
  </div>
);

const inlineSelectWrapperClassName = "w-[9.5rem] max-w-[42vw]";
const sectionClassName = "pt-1.5 first:pt-0";
const dividerClassName = "border-zinc-200 dark:border-white/10";
const fieldPanelClassName = "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5";
const highlightedPanelClassName = "border-zinc-300 bg-zinc-50/80 dark:border-white/15 dark:bg-white/5";

const getTextThemeClasses = (className = "") =>
  className
    .split(/\s+/)
    .filter((token) =>
      /^(text-|font-|tracking-|leading-|uppercase|lowercase|capitalize|dark:text-)/.test(token)
    )
    .join(" ");

const useMapSettingsUI = (mapAPI) => {
  const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || { UI: {}, theme: {} };
  const controls = useMapSettingsControls(mapAPI);
  const Select = UI?.MultiSelect || (() => null);
  const fieldTheme = getComponentTheme(themeFromContext, "field") || {};
  const navigableMenuTheme = getComponentTheme(themeFromContext, "navigableMenu") || {};
  const menuLabelClassName = getTextThemeClasses(navigableMenuTheme.menuItem);

  return {
    ...controls,
    UI,
    Select,
    fieldTheme,
    labelClassName: `${menuLabelClassName || fieldTheme.label} select-none`,
    descriptionClassName: fieldTheme.description,
    sectionClassName,
    dividerClassName,
    fieldPanelClassName,
    highlightedPanelClassName,
  };
};

const DebouncedTextInput = ({ value, onCommit, delay = 500, Input, ...props }) => {
  const [draftValue, setDraftValue] = React.useState(value ?? "");

  React.useEffect(() => {
    setDraftValue(value ?? "");
  }, [value]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if ((value ?? "") !== draftValue) {
        onCommit(draftValue);
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, draftValue, onCommit, value]);

  return (
    <Input
      {...props}
      type="text"
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
    />
  );
};

const FullWidthSelectField = ({ Select, className = "", ...props }) => {
  const wrapperRef = React.useRef(null);

  React.useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    [
      wrapper,
      wrapper.firstElementChild,
      wrapper.firstElementChild?.firstElementChild,
    ]
      .filter(Boolean)
      .forEach((element) => {
        element.style.width = "100%";
        element.style.minWidth = "0";
      });
  }, [props.options, props.value]);

  return (
    <div ref={wrapperRef} className={`w-full min-w-0 ${className}`}>
      <Select {...props} />
    </div>
  );
};

const renderMenuField = (render) => (props) => (
  <div className="w-full min-w-0 block">
    {render(props)}
  </div>
);

const MapHeightControl = ({ mapAPI }) => {
  const { state, heightOptions, setHeight, Select, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);

  return (
    <InlineField label="Height" border={false} labelClassName={labelClassName} dividerClassName={dividerClassName}>
      <div className={inlineSelectWrapperClassName}>
        <Select
          value={state.height}
          options={heightOptions.map((option) => ({ label: option, value: option }))}
          onChange={setHeight}
          singleSelectOnly={true}
        />
      </div>
    </InlineField>
  );
};

const MapLegendPositionControl = ({ mapAPI }) => {
  const { state, panelPositionOptions, setLegendPosition, Select, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);

  return (
    <InlineField label="Legend Position" labelClassName={labelClassName} dividerClassName={dividerClassName}>
      <div className={inlineSelectWrapperClassName}>
        <Select
          value={state.legendPosition}
          options={panelPositionOptions.map((option) => ({ label: option, value: option }))}
          onChange={setLegendPosition}
          singleSelectOnly={true}
        />
      </div>
    </InlineField>
  );
};

const MapPluginControlPositionControl = ({ mapAPI }) => {
  const { state, arePluginsLoaded, panelPositionOptions, setPluginControlPosition, Select, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);

  if (!arePluginsLoaded) return null;

  return (
    <InlineField label="Plugin Control Position" labelClassName={labelClassName} dividerClassName={dividerClassName}>
      <div className={inlineSelectWrapperClassName}>
        <Select
          value={state.pluginControlPosition}
          options={panelPositionOptions.map((option) => ({ label: option, value: option }))}
          onChange={setPluginControlPosition}
          singleSelectOnly={true}
        />
      </div>
    </InlineField>
  );
};

const MapZoomPanControl = ({ mapAPI }) => {
  const { state, setZoomPan, UI, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Zoom/pan" value={state?.zoomPan} onChange={setZoomPan} SwitchComp={Switch} labelClassName={labelClassName} dividerClassName={dividerClassName} />;
};

const MapInitialViewportControl = ({ mapAPI }) => {
  const { state, setInitialBounds, UI, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  const hasInitialViewport = Boolean(state?.setInitialBounds || state?.initialBounds);
  return (
    <ToggleRow
      label="Set initial viewport"
      value={hasInitialViewport}
      onChange={setInitialBounds}
      SwitchComp={Switch}
      labelClassName={`${labelClassName} max-w-[9rem] leading-5`}
      dividerClassName={dividerClassName}
    />
  );
};

const MapBlankBasemapControl = ({ mapAPI }) => {
  const { state, setBlankBasemap, UI, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Use blank basemap" value={state?.blankBaseMap} onChange={setBlankBasemap} SwitchComp={Switch} labelClassName={labelClassName} dividerClassName={dividerClassName} />;
};

const MapZoomToFitControl = ({ mapAPI }) => {
  const { state, setZoomToFitBounds, UI, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Zoom to Fit" value={state?.zoomToFitBounds} onChange={setZoomToFitBounds} SwitchComp={Switch} labelClassName={labelClassName} dividerClassName={dividerClassName} />;
};

/**
 * Unified Symbologies manager (the whole "Symbologies" screen) — replaces the
 * legacy single-symbology picker (which destructively replaced the whole map)
 * AND the separate Layer Library control. One additive place to see and manage
 * what's on the map:
 *   - a mode/panel section (Layer Library Panel, Shareable URL State),
 *   - an "On this map" list: every symbology with a visibility toggle, an
 *     "active" marker (the first-visible one the map treats as primary), its
 *     library category, per-symbology Refresh, active-layer picker (>1 layer),
 *     and Remove,
 *   - an additive "Add symbology" (never wipes the others).
 * Single vs multi is self-evident: one row = single-symbology; adding a second
 * is multi. No destructive "replace all" anywhere.
 */
const MapSymbologyManager = ({ mapAPI }) => {
  const {
    state,
    symbologyOptions,
    libraryEntries,
    libraryCategories,
    addSymbologyToLibrary,
    removeSymbologyFromLibrary,
    setSymbologyVisible,
    setActiveLayer,
    onUpdateSymbology,
    isUpdatingSymbology,
    setLayerPanel,
    setShareableState,
    UI,
    Select,
    labelClassName,
    descriptionClassName,
    dividerClassName: divCls,
    sectionClassName: secCls,
    fieldPanelClassName: panelCls,
  } = useMapSettingsUI(mapAPI);
  const { Switch, Input, Icon } = UI;
  const [pendingSymbology, setPendingSymbology] = React.useState(null);
  const [pendingCategory, setPendingCategory] = React.useState("");

  const symbologies = state?.symbologies || {};
  const symIds = Object.keys(symbologies);
  const activeSymId = symIds.find((id) => symbologies[id]?.isVisible);
  const isLibrary = state?.display?.layerPanel === "library";
  const categoryBySym = {};
  (libraryEntries || []).forEach((e) => { categoryBySym[String(e.symbologyId)] = e.tabName; });

  return (
    <div className={`${secCls} w-full min-w-0`}>
      {/* Mode / panel settings */}
      <ToggleRow
        label="Layer Library Panel"
        border={false}
        value={isLibrary}
        onChange={(enabled) => setLayerPanel(enabled ? "library" : "none")}
        SwitchComp={Switch}
        labelClassName={labelClassName}
        dividerClassName={divCls}
      />
      <div className={`${descriptionClassName} pb-1`}>
        {isLibrary
          ? "Viewers get an on-map panel to toggle these symbologies."
          : "Symbologies render as configured; viewers get no toggle panel."}
      </div>
      <ToggleRow
        label="Shareable URL State"
        value={Boolean(state?.display?.shareableState)}
        onChange={setShareableState}
        SwitchComp={Switch}
        labelClassName={labelClassName}
        dividerClassName={divCls}
      />

      {/* On this map */}
      <div className={`${labelClassName} pt-3 pb-1`}>On this map</div>
      {symIds.length === 0 ? (
        <div className={descriptionClassName}>No symbologies yet — add one below.</div>
      ) : (
        symIds.map((id) => {
          const entry = symbologies[id];
          const sym = entry?.symbology || {};
          const layers = sym.layers || {};
          const layerKeys = Object.keys(layers);
          const visible = Boolean(entry?.isVisible);
          const name = entry?.name || `Symbology ${id}`;
          return (
            <div key={id} className={`border-t ${divCls} py-2 w-full min-w-0`}>
              <div className="flex items-center gap-2 w-full min-w-0">
                <span className="shrink-0">
                  <Switch enabled={visible} setEnabled={(v) => setSymbologyVisible(id, v)} size="small" />
                </span>
                <span className={`${labelClassName} min-w-0 flex-1 truncate`}>{name}</span>
                {id === activeSymId ? <span className={`${descriptionClassName} shrink-0`}>active</span> : null}
                {categoryBySym[id] ? <span className={`${descriptionClassName} shrink-0 truncate max-w-[6rem]`}>{categoryBySym[id]}</span> : null}
                <button
                  type="button"
                  title="Sync this symbology with the latest editor changes"
                  disabled={isUpdatingSymbology}
                  onClick={() => onUpdateSymbology(id)}
                  className="shrink-0 p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-50 disabled:cursor-default cursor-pointer"
                >
                  {Icon
                    ? <Icon icon="Refresh" className={`size-4 ${isUpdatingSymbology ? "animate-spin" : ""}`} />
                    : <span className="text-xs">↻</span>}
                </button>
                <button
                  type="button"
                  title="Remove from map"
                  onClick={() => removeSymbologyFromLibrary(id)}
                  className="shrink-0 cursor-pointer text-xs text-zinc-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
              {layerKeys.length > 1 ? (
                <div className="pl-9 pt-1 w-full min-w-0">
                  <FullWidthSelectField
                    Select={Select}
                    value={sym.activeLayer || ""}
                    options={layerKeys.map((k, i) => ({ label: layers[k]?.name?.trim() || `layer - ${i + 1}`, value: k }))}
                    onChange={(value) => setActiveLayer(id, value?.value ?? value)}
                    placeholder="Active layer…"
                    singleSelectOnly={true}
                  />
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {/* Add symbology (additive) */}
      <div className={`${labelClassName} pt-3 pb-1`}>Add symbology</div>
      <FullWidthSelectField
        Select={Select}
        value={pendingSymbology || ""}
        options={symbologyOptions.map((option) => ({ label: option.label, value: option.key }))}
        onChange={(value) => setPendingSymbology(value?.value ?? value)}
        placeholder="Search available symbologies…"
        singleSelectOnly={true}
      />
      {isLibrary ? (
        <Field label={`Category${libraryCategories.length ? ` (${libraryCategories.join(" · ")})` : ""}`} compact labelClassName={labelClassName}>
          <Input type="text" value={pendingCategory} placeholder="Layers" onChange={(event) => setPendingCategory(event.target.value)} />
        </Field>
      ) : null}
      <button
        type="button"
        disabled={!pendingSymbology}
        className={`mt-1 w-full rounded-md border px-3 py-1.5 text-sm ${panelCls} ${pendingSymbology ? "cursor-pointer hover:border-zinc-400" : "opacity-50"}`}
        onClick={() => {
          if (!pendingSymbology) return;
          addSymbologyToLibrary(pendingSymbology, pendingCategory);
          setPendingSymbology(null);
          setPendingCategory("");
        }}
      >
        Add to map
      </button>
      <div className={`${descriptionClassName} pt-1`}>
        Added hidden — toggle it on above. A second symbology puts the map in multi-symbology mode.
      </div>
    </div>
  );
};

/**
 * Multi-symbology page-bridge authoring UI (the whole "Filters" screen).
 *
 * The framework resolves `controls(theme)` without map state, so the per-symbology
 * list can't be native drill-in nodes — it lives here, in one leaf that receives
 * `mapAPI` (state + setState) and renders its own list → detail drill-in. Each
 * symbology is one row (name + the page variable it drives + filter counts); the
 * list makes the multi-symbology binding explicit, and the detail view configures
 * that symbology's own layer (unify: its `searchParamKey` page var), never just the
 * single first-visible one the legacy controls were bound to.
 */
const MapFilterBridgeList = ({ mapAPI }) => {
  const {
    UI,
    Select,
    labelClassName,
    descriptionClassName,
    dividerClassName: divCls,
    sectionClassName: secCls,
    fieldPanelClassName: panelCls,
    highlightedPanelClassName: hiPanelCls,
  } = useMapSettingsUI(mapAPI);
  const { Input, Switch } = UI;
  const state = mapAPI?.state;
  const setState = mapAPI?.setState;
  const [selectedSymId, setSelectedSymId] = React.useState(null);

  const symbologies = listBridgeSymbologies(state);
  if (!symbologies.length) {
    return <div className={descriptionClassName}>No symbologies to configure yet.</div>;
  }

  // ---------- List view: one row per symbology ----------
  if (selectedSymId == null || !state?.symbologies?.[selectedSymId]) {
    return (
      <div className={`${secCls} w-full min-w-0`}>
        <div className={`${descriptionClassName} pb-2`}>
          Each symbology binds its selected variant to a page variable (a URL param).
          Pick one to configure how it connects to the page.
        </div>
        {symbologies.map((s) => (
          <button
            key={s.symId}
            type="button"
            onClick={() => setSelectedSymId(s.symId)}
            className={`w-full min-w-0 text-left border-t ${divCls} py-2 flex items-center justify-between gap-3 cursor-pointer hover:opacity-80`}
          >
            <span className="min-w-0">
              <span className={`${labelClassName} block truncate`}>{s.name}</span>
              <span className={`${descriptionClassName} block`}>
                {[
                  s.interactiveCount ? `${s.interactiveCount} interactive` : null,
                  s.dynamicCount ? `${s.dynamicCount} dynamic` : null,
                ].filter(Boolean).join(" · ") || "no filters"}
              </span>
            </span>
            <span className={`${descriptionClassName} flex-shrink-0 flex items-center gap-1`}>
              {s.searchParamKey
                ? <span className="font-mono">{`?${s.searchParamKey}=`}</span>
                : <span className="italic">no page var</span>}
              <span aria-hidden="true">›</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ---------- Detail view: configure the selected symbology's bridge ----------
  const b = getSymbologyBridge(state, setState, selectedSymId);
  return (
    <div className={`${secCls} w-full min-w-0`}>
      <button
        type="button"
        onClick={() => setSelectedSymId(null)}
        className={`${descriptionClassName} pb-1 cursor-pointer hover:opacity-80`}
      >
        ‹ All symbologies
      </button>
      <div className={`${labelClassName} pb-1`}>{b.name}</div>

      {!b.hasLayer ? (
        <div className={descriptionClassName}>This symbology has no active layer to configure.</div>
      ) : (
        <React.Fragment>
          <ToggleRow
            label="Use Page Filters"
            border={false}
            value={b.usePageFilters}
            onChange={b.setUsePageFilters}
            SwitchComp={Switch}
            labelClassName={labelClassName}
            dividerClassName={divCls}
          />
          <InlineField label="Page Variable Key" labelClassName={labelClassName} dividerClassName={divCls}>
            <div className={inlineSelectWrapperClassName}>
              <DebouncedTextInput Input={Input} value={b.searchParamKey} delay={750} onCommit={b.setSearchParamKey} />
            </div>
          </InlineField>
          <div className={`${descriptionClassName} pb-2`}>
            {b.searchParamKey
              ? <React.Fragment>Shares as <span className="font-mono">{`?${b.searchParamKey}=<value>`}</span> in the page URL.</React.Fragment>
              : "Set a key to share this symbology's selected variant in the URL."}
          </div>

          {b.interactiveFilterOptions.length ? (
            <div className={`${secCls} w-full min-w-0`}>
              <div className={labelClassName}>Interactive Filter</div>
              {b.interactiveFilterOptions.map((filter, index) => (
                <div key={`${filter.label || "interactive"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
                  <FilterGroup
                    title={filter.label || `Interactive Filter ${index + 1}`}
                    highlighted={index > 0}
                    titleClassName={labelClassName}
                    fieldPanelClassName={panelCls}
                    highlightedPanelClassName={hiPanelCls}
                  >
                    <Field label="Search Param Value" compact labelClassName={labelClassName}>
                      <div className="w-full">
                        <DebouncedTextInput Input={Input} value={filter.searchParamValue || filter.label || ""} delay={500} onCommit={(value) => b.setInteractiveSearchParamValue(index, value)} />
                      </div>
                    </Field>
                    <ToggleRow
                      label="Active"
                      border={false}
                      value={b.activeFilter === index}
                      SwitchComp={Switch}
                      labelClassName={labelClassName}
                      dividerClassName={divCls}
                      onChange={(enabled) => { if (enabled) b.activateInteractiveFilter(index); }}
                    />
                  </FilterGroup>
                </div>
              ))}
            </div>
          ) : null}

          {b.dynamicFilterOptions.length ? (
            <div className={`${secCls} w-full min-w-0`}>
              <div className={labelClassName}>Dynamic Filter</div>
              {b.dynamicFilterOptions.map((filter, index) => (
                <div key={`${filter.column_name || "dynamic"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
                  <FilterGroup
                    title={filter.display_name || filter.column_name || `Dynamic Filter ${index + 1}`}
                    highlighted={index > 0}
                    titleClassName={labelClassName}
                    fieldPanelClassName={panelCls}
                    highlightedPanelClassName={hiPanelCls}
                  >
                    <Field label="Search Param Key" compact labelClassName={labelClassName}>
                      <DebouncedTextInput Input={Input} value={filter.searchParamKey || filter.column_name || ""} delay={500} onCommit={(value) => b.setDynamicSearchParamKey(index, value)} />
                    </Field>
                    <Field label="Default Value" compact labelClassName={labelClassName}>
                      <DebouncedTextInput Input={Input} value={filter.defaultValue ?? ""} delay={500} onCommit={(value) => b.setDynamicDefaultValue(index, value)} />
                    </Field>
                    <Field label="Type" compact={false} labelClassName={labelClassName}>
                      <Select
                        value={filter.dataType || "string"}
                        options={[
                          { label: "String", value: "string" },
                          { label: "Numeric", value: "numeric" },
                        ]}
                        onChange={(value) => b.setDynamicDataType(index, value?.value ?? value ?? "string")}
                        singleSelectOnly={true}
                      />
                    </Field>
                  </FilterGroup>
                </div>
              ))}
            </div>
          ) : null}

          {b.clickFilterEnabled && b.clickFilterMappings.length ? (
            <div className={`${secCls} w-full min-w-0`}>
              <div className={labelClassName}>Layer Click Filter</div>
              {b.clickFilterMappings.map((mapping, mI) => (
                <div key={`${mapping.variable || "click"}_${mI}`} className={`${mI === 0 ? "" : "mt-3"} w-full min-w-0`}>
                  <FilterGroup
                    title={mapping.variable || "Untitled variable"}
                    highlighted={mI > 0}
                    titleClassName={labelClassName}
                    fieldPanelClassName={panelCls}
                    highlightedPanelClassName={hiPanelCls}
                  >
                    <ToggleRow
                      label="Use URL Param"
                      border={false}
                      value={Boolean(mapping.useSearchParams)}
                      SwitchComp={Switch}
                      labelClassName={labelClassName}
                      dividerClassName={divCls}
                      onChange={(value) => b.setClickFilterUseSearchParam(mI, value)}
                    />
                    <Field label="Layer Field" compact labelClassName={labelClassName}>
                      <StaticFieldValue value={mapping.field || "-"} valueClassName={labelClassName} fieldPanelClassName={panelCls} />
                    </Field>
                  </FilterGroup>
                </div>
              ))}
            </div>
          ) : null}

          {!b.interactiveFilterOptions.length && !b.dynamicFilterOptions.length && !(b.clickFilterEnabled && b.clickFilterMappings.length) ? (
            <div className={descriptionClassName}>No interactive, dynamic, or click filters on this symbology's layer.</div>
          ) : null}
        </React.Fragment>
      )}
    </div>
  );
};

export const MapControls = () => ({
  default: [
    {
      key: "map_symbologies_nav",
      label: "Symbologies",
      items: [
        // Unified additive manager: what's on the map (visibility + active),
        // add/remove, categories, per-symbology refresh + active layer, and the
        // Layer Library Panel / Shareable URL State mode toggles. Replaces the old
        // destructive single-symbology picker + separate Layer Library control.
        { key: "map_symbologies", label: "Symbologies", type: renderMenuField(({ mapAPI }) => <MapSymbologyManager mapAPI={mapAPI} />) },
      ],
    },
    {
      key: "map_filters_nav",
      label: "Filters",
      items: [
        // Per-symbology page-variable bridge (multi-symbology). One leaf renders the
        // whole Filters screen from map state — list of symbologies → drill into one
        // to wire its page var, interactive variant, dynamic + click filters.
        { key: "map_filter_bridge", label: "Page Variable Bridge", type: renderMenuField(({ mapAPI }) => <MapFilterBridgeList mapAPI={mapAPI} />) },
      ],
    },
    {
      key: "map_display_nav",
      label: "Display",
      items: [
        { key: "map_height", label: "Height", type: renderMenuField(({ mapAPI }) => <MapHeightControl mapAPI={mapAPI} />) },
        { key: "map_legend_position", label: "Legend Position", type: renderMenuField(({ mapAPI }) => <MapLegendPositionControl mapAPI={mapAPI} />) },
        { key: "map_plugin_control_position", label: "Plugin Control Position", type: renderMenuField(({ mapAPI }) => <MapPluginControlPositionControl mapAPI={mapAPI} />) },
        { key: "map_zoom_pan", label: "Zoom/pan", type: renderMenuField(({ mapAPI }) => <MapZoomPanControl mapAPI={mapAPI} />) },
        { key: "map_initial_viewport", label: "Set initial viewport", type: renderMenuField(({ mapAPI }) => <MapInitialViewportControl mapAPI={mapAPI} />) },
        { key: "map_blank_basemap", label: "Use blank basemap", type: renderMenuField(({ mapAPI }) => <MapBlankBasemapControl mapAPI={mapAPI} />) },
        { key: "map_zoom_to_fit", label: "Zoom to Fit", type: renderMenuField(({ mapAPI }) => <MapZoomToFitControl mapAPI={mapAPI} />) },
      ],
    },
  ],
});
