import React, { useContext } from "react";

import { ThemeContext, getComponentTheme } from "../../../../../../../../ui/useTheme";
import useMapSettingsControls from "./state.jsx";

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

const MapSymbologyControl = ({ mapAPI }) => {
  const {
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    onUpdateSymbology,
    isUpdatingSymbology,
    Select,
    UI,
    labelClassName,
    sectionClassName,
  } = useMapSettingsUI(mapAPI);

  const RefreshIcon = UI?.Icon;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      <div className="pb-2 w-full min-w-0">
        {/* Label row + Refresh: re-fetch the selected symbology from the source
            (new/removed dynamic variables, restyling flow in) while preserving
            the author's DMS Map settings. Merge, not replace — see
            symbologySelector.mergeSymbologyPreservingUserConfig. */}
        <div className="flex items-center justify-between">
          <label className={labelClassName}>Symbology</label>
          {selectedSymbology && onUpdateSymbology ? (
            <button
              type="button"
              onClick={onUpdateSymbology}
              disabled={isUpdatingSymbology}
              aria-label="Refresh symbology"
              title="Sync this map with the latest editor changes"
              className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-50 disabled:cursor-default cursor-pointer"
            >
              {RefreshIcon ? (
                <RefreshIcon icon="Refresh" className={`size-4 ${isUpdatingSymbology ? "animate-spin" : ""}`} />
              ) : (
                <span className="text-xs">{isUpdatingSymbology ? "…" : "↻"}</span>
              )}
            </button>
          ) : null}
        </div>
        <FullWidthSelectField
          Select={Select}
          className="mt-1"
          value={selectedSymbology || ""}
          options={symbologyOptions.map((option) => ({ label: option.label, value: option.key }))}
          onChange={onSymbologyChange}
          placeholder="Search..."
          singleSelectOnly={true}
        />
      </div>
    </div>
  );
};

const MapLayerControl = ({ mapAPI }) => {
  const { selectedSymbology, selectedLayer, layerOptions, onLayerChange, Select, labelClassName } = useMapSettingsUI(mapAPI);

  return (
    <Field label="Layer" labelClassName={labelClassName}>
      <FullWidthSelectField
        Select={Select}
        className="mt-1"
        value={selectedLayer}
        options={layerOptions.map((option) => ({ label: option.label, value: option.key }))}
        onChange={onLayerChange}
        placeholder="Search..."
        singleSelectOnly={true}
      />
    </Field>
  );
};

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

const MapUsePageFiltersControl = ({ mapAPI, border = false }) => {
  const { activeLayer, setUsePageFilters, UI, labelClassName, descriptionClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;

  if (!activeLayer) return <div className={descriptionClassName}>Select a layer first.</div>;

  return <ToggleRow label="Use Page Filters" border={border} value={activeLayer?.usePageFilters} onChange={setUsePageFilters} SwitchComp={Switch} labelClassName={labelClassName} dividerClassName={dividerClassName} />;
};

const MapKeySearchParamControl = ({ mapAPI, border = true }) => {
  const { activeLayer, setSearchParamKey, UI, labelClassName, dividerClassName } = useMapSettingsUI(mapAPI);
  const { Input } = UI;

  if (!activeLayer) return null;

  return (
    <InlineField label="Key Search Param" border={border} labelClassName={labelClassName} dividerClassName={dividerClassName}>
      <div className={inlineSelectWrapperClassName}>
        <DebouncedTextInput
          Input={Input}
          value={activeLayer?.searchParamKey || ""}
          delay={750}
          onCommit={setSearchParamKey}
        />
      </div>
    </InlineField>
  );
};

const MapInteractiveFiltersControl = ({ mapAPI }) => {
  const {
    activeLayer,
    interactiveFilterOptions,
    activeFilter,
    setInteractiveSearchParamValue,
    activateInteractiveFilter,
    UI,
    labelClassName,
    descriptionClassName,
    sectionClassName,
    dividerClassName,
    fieldPanelClassName,
    highlightedPanelClassName,
  } = useMapSettingsUI(mapAPI);
  const { Input, Switch } = UI;
  const filters = interactiveFilterOptions || [];

  if (!activeLayer || !filters.length) return <div className={descriptionClassName}>No interactive filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {filters.map((filter, index) => (
        <div key={`${filter.label || "interactive"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup
            title={filter.label || `Interactive Filter ${index + 1}`}
            highlighted={index > 0}
            titleClassName={labelClassName}
            fieldPanelClassName={fieldPanelClassName}
            highlightedPanelClassName={highlightedPanelClassName}
          >
            <Field label="Search Param Value" compact labelClassName={labelClassName}>
              <div className="w-full">
                <DebouncedTextInput
                  Input={Input}
                  value={filter.searchParamValue || filter.label || ""}
                  delay={500}
                  onCommit={(value) => setInteractiveSearchParamValue(index, value)}
                />
              </div>
            </Field>
            <ToggleRow
              label="Active"
              border={false}
              value={activeFilter === index}
              SwitchComp={Switch}
              labelClassName={labelClassName}
              dividerClassName={dividerClassName}
              onChange={(enabled) => {
                if (!enabled) return;
                activateInteractiveFilter(index);
            }}
          />
          </FilterGroup>
        </div>
      ))}
    </div>
  );
};

const MapDynamicFiltersControl = ({ mapAPI }) => {
  const {
    activeLayer,
    dynamicFilterOptions,
    setDynamicSearchParamKey,
    setDynamicDefaultValue,
    setDynamicDataType,
    UI,
    Select,
    labelClassName,
    descriptionClassName,
    sectionClassName,
    fieldPanelClassName,
    highlightedPanelClassName,
  } = useMapSettingsUI(mapAPI);
  const { Input } = UI;
  const filters = dynamicFilterOptions || [];

  if (!activeLayer || !filters.length) return <div className={descriptionClassName}>No dynamic filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {filters.map((filter, index) => (
        <div key={`${filter.column_name || "dynamic"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup
            title={filter.display_name || filter.column_name || `Dynamic Filter ${index + 1}`}
            highlighted={index > 0}
            titleClassName={labelClassName}
            fieldPanelClassName={fieldPanelClassName}
            highlightedPanelClassName={highlightedPanelClassName}
          >
            <Field label="Search Param Value" compact labelClassName={labelClassName}>
              <DebouncedTextInput
                Input={Input}
                value={filter.searchParamKey || filter.column_name || ""}
                delay={500}
                onCommit={(value) => setDynamicSearchParamKey(index, value)}
              />
            </Field>
            <Field label="Default Value" compact labelClassName={labelClassName}>
              <DebouncedTextInput
                Input={Input}
                value={filter.defaultValue ?? ""}
                delay={500}
                onCommit={(value) => setDynamicDefaultValue(index, value)}
              />
            </Field>
            <Field label="Type" compact={false} labelClassName={labelClassName}>
              {/**
                * Store an explicit string value for the select so the "String"
                * label renders correctly and the handler accepts either a raw
                * value or the full option object returned by MultiSelect.
                */}
              <Select
                value={filter.dataType || "string"}
                options={[
                  { label: "String", value: "string" },
                  { label: "Numeric", value: "numeric" },
                ]}
                onChange={(value) => setDynamicDataType(index, value?.value ?? value ?? "string")}
                singleSelectOnly={true}
              />
            </Field>
          </FilterGroup>
        </div>
      ))}
    </div>
  );
};

const MapLayerClickFiltersControl = ({ mapAPI }) => {
  const {
    activeLayer,
    isSelectedVariableMappingsEnabled,
    selectedVariableMappings,
    setClickFilterUseSearchParam,
    UI,
    labelClassName,
    descriptionClassName,
    sectionClassName,
    dividerClassName,
    fieldPanelClassName,
    highlightedPanelClassName,
  } = useMapSettingsUI(mapAPI);
  const { Switch, Input } = UI;
  const mappings = isSelectedVariableMappingsEnabled ? selectedVariableMappings || [] : [];

  if (!activeLayer || !mappings.length) return <div className={descriptionClassName}>No layer click filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {mappings.map((mapping, index) => (
        <div key={`${mapping.variable || "mapping"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup
            title={null}
            highlighted={index > 0}
            titleClassName={labelClassName}
            fieldPanelClassName={fieldPanelClassName}
            highlightedPanelClassName={highlightedPanelClassName}
          >
          <Field label="Selected Variable" compact labelClassName={labelClassName}>
            <StaticFieldValue value={mapping.variable || "Untitled variable"} valueClassName={labelClassName} fieldPanelClassName={fieldPanelClassName} />
          </Field>
            <ToggleRow
              label="Use URL Param"
              border={false}
              value={Boolean(mapping.useSearchParams)}
              onChange={(enabled) => setClickFilterUseSearchParam(index, enabled)}
              SwitchComp={Switch}
              labelClassName={labelClassName}
              dividerClassName={dividerClassName}
            />
          <Field label="Layer Field" compact={false} labelClassName={labelClassName}>
            <StaticFieldValue value={mapping.field || "-"} valueClassName={labelClassName} fieldPanelClassName={fieldPanelClassName} />
          </Field>
          </FilterGroup>
        </div>
      ))}
    </div>
  );
};

export const MapControls = () => ({
  default: [
    { key: "map_symbology", label: "Symbology", type: renderMenuField(({ mapAPI }) => <MapSymbologyControl mapAPI={mapAPI} />) },
    { key: "map_layer", label: "Layer", type: renderMenuField(({ mapAPI }) => <MapLayerControl mapAPI={mapAPI} />) },
    {
      key: "map_filters_nav",
      label: "Filters",
      items: [
        { key: "map_use_page_filters", label: "Use Page Filters", type: renderMenuField(({ mapAPI }) => <MapUsePageFiltersControl mapAPI={mapAPI} border={false} />) },
        { key: "map_key_search_param", label: "Key Search Param", type: renderMenuField(({ mapAPI }) => <MapKeySearchParamControl mapAPI={mapAPI} border={true} />) },
        {
          key: "map_interactive_filters_nav",
          label: "Interactive Filter",
          items: [
            { key: "map_interactive_filters", label: "Interactive Filter Details", type: renderMenuField(({ mapAPI }) => <MapInteractiveFiltersControl mapAPI={mapAPI} />) },
          ],
        },
        {
          key: "map_dynamic_filters_nav",
          label: "Dynamic Filter",
          items: [
            { key: "map_dynamic_filters", label: "Dynamic Filter Details", type: renderMenuField(({ mapAPI }) => <MapDynamicFiltersControl mapAPI={mapAPI} />) },
          ],
        },
        {
          key: "map_click_filters_nav",
          label: "Layer Click Filter",
          items: [
            { key: "map_click_filters", label: "Layer Click Filter Details", type: renderMenuField(({ mapAPI }) => <MapLayerClickFiltersControl mapAPI={mapAPI} />) },
          ],
        },
      ],
    },
    { key: "map_height", label: "Height", type: renderMenuField(({ mapAPI }) => <MapHeightControl mapAPI={mapAPI} />) },
    { key: "map_legend_position", label: "Legend Position", type: renderMenuField(({ mapAPI }) => <MapLegendPositionControl mapAPI={mapAPI} />) },
    { key: "map_plugin_control_position", label: "Plugin Control Position", type: renderMenuField(({ mapAPI }) => <MapPluginControlPositionControl mapAPI={mapAPI} />) },
    { key: "map_zoom_pan", label: "Zoom/pan", type: renderMenuField(({ mapAPI }) => <MapZoomPanControl mapAPI={mapAPI} />) },
    { key: "map_initial_viewport", label: "Set initial viewport", type: renderMenuField(({ mapAPI }) => <MapInitialViewportControl mapAPI={mapAPI} />) },
    { key: "map_blank_basemap", label: "Use blank basemap", type: renderMenuField(({ mapAPI }) => <MapBlankBasemapControl mapAPI={mapAPI} />) },
    { key: "map_zoom_to_fit", label: "Zoom to Fit", type: renderMenuField(({ mapAPI }) => <MapZoomToFitControl mapAPI={mapAPI} />) },
  ],
});
