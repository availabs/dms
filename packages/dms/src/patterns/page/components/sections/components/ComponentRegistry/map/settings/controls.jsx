import React, { useContext } from "react";

import { ThemeContext } from "../../../../../../../../ui/useTheme";
import useMapSettingsControls from "./state.jsx";

const labelClassName = "text-sm font-medium text-slate-100";
const sectionClassName = "pt-1.5 first:pt-0";
const emptyStateClassName = "text-sm text-slate-400";

const Field = ({ label, children, compact = false }) => (
  <div className={`${compact ? "pb-1.5" : "pb-2"} w-full min-w-0`}>
    <label className={labelClassName}>{label}</label>
    {children}
  </div>
);

const StaticFieldValue = ({ value }) => (
  <div className="mt-1 min-h-9 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm leading-5 text-slate-200 break-words flex items-center">
    {value}
  </div>
);

const InlineField = ({ label, children, border = true, alignStart = false }) => (
  <div className={`${border ? "border-t border-slate-800" : ""} flex w-full items-center justify-between gap-3 py-2`}>
    <label className={`min-w-0 flex-1 text-base text-slate-100 ${alignStart ? "self-start pt-1" : ""}`}>{label}</label>
    <div className={`${alignStart ? "pt-0" : ""} ml-auto min-w-0 flex-shrink-0`}>
      {children}
    </div>
  </div>
);

const ToggleRow = ({ label, value, onChange, border = true, labelClassName = "text-base text-slate-100", SwitchComp }) => (
  <div className={`${border ? "border-t border-slate-800" : ""} flex w-full items-center justify-between gap-3 py-2`}>
    <span className={`${labelClassName} min-w-0 flex-1`}>{label}</span>
    <div className="ml-auto flex-shrink-0">
      {SwitchComp ? <SwitchComp enabled={Boolean(value)} setEnabled={onChange} size="small" /> : null}
    </div>
  </div>
);

const FilterGroup = ({ title, children, highlighted = false }) => (
  <div className={`w-full rounded-md px-3 py-3 ${highlighted ? "border border-slate-600 bg-slate-900/30" : "border border-slate-700/80"}`}>
    {title ? <div className="pb-2 text-base font-medium text-slate-100">{title}</div> : null}
    {children}
  </div>
);

const useMapSettingsUI = (mapAPI) => {
  const { UI } = useContext(ThemeContext) || { UI: {} };
  const controls = useMapSettingsControls(mapAPI);
  const Select = UI?.MultiSelect || (() => null);
  return { ...controls, UI, Select };
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

const MapSymbologyControl = ({ mapAPI }) => {
  const { selectedSymbology, symbologyOptions, onSymbologyChange, Select } = useMapSettingsUI(mapAPI);

  return (
    <div className={sectionClassName}>
      <Field label="Symbology">
        <Select
          value={selectedSymbology || ""}
          options={symbologyOptions.map((option) => ({ label: option.label, value: option.key }))}
          onChange={onSymbologyChange}
          placeholder="Search..."
          singleSelectOnly={true}
        />
      </Field>
    </div>
  );
};

const MapLayerControl = ({ mapAPI }) => {
  const { selectedSymbology, selectedLayer, layerOptions, onLayerChange, Select } = useMapSettingsUI(mapAPI);

  return (
    <Field label="Layer">
      <Select
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
  const { state, heightOptions, setHeight, Select } = useMapSettingsUI(mapAPI);

  return (
    <InlineField label="Height" border={false}>
      <div className="w-[8rem] max-w-[40vw]">
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
  const { state, panelPositionOptions, setLegendPosition, Select } = useMapSettingsUI(mapAPI);

  return (
    <InlineField label="Legend Position">
      <div className="w-[9.5rem] max-w-[42vw]">
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
  const { state, arePluginsLoaded, panelPositionOptions, setPluginControlPosition, Select } = useMapSettingsUI(mapAPI);

  if (!arePluginsLoaded) return null;

  return (
    <InlineField label="Plugin Control Position">
      <div className="w-[9.5rem] max-w-[42vw]">
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
  const { state, setZoomPan, UI } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Zoom/pan" border={false} value={state?.zoomPan} onChange={setZoomPan} SwitchComp={Switch} />;
};

const MapInitialViewportControl = ({ mapAPI }) => {
  const { state, setInitialBounds, UI } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return (
    <ToggleRow
      label="Set initial viewport"
      value={state?.setInitialBounds}
      onChange={setInitialBounds}
      SwitchComp={Switch}
      labelClassName="max-w-[9rem] text-base leading-5 text-slate-100"
    />
  );
};

const MapBlankBasemapControl = ({ mapAPI }) => {
  const { state, setBlankBasemap, UI } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Use blank basemap" value={state?.blankBaseMap} onChange={setBlankBasemap} SwitchComp={Switch} />;
};

const MapZoomToFitControl = ({ mapAPI }) => {
  const { state, setZoomToFitBounds, UI } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;
  return <ToggleRow label="Zoom to Fit" value={state?.zoomToFitBounds} onChange={setZoomToFitBounds} SwitchComp={Switch} />;
};

const MapUsePageFiltersControl = ({ mapAPI, border = false }) => {
  const { activeLayer, setUsePageFilters, UI } = useMapSettingsUI(mapAPI);
  const { Switch } = UI;

  if (!activeLayer) return <div className={emptyStateClassName}>Select a layer first.</div>;

  return <ToggleRow label="Use Page Filters" border={border} value={activeLayer?.usePageFilters} onChange={setUsePageFilters} SwitchComp={Switch} />;
};

const MapKeySearchParamControl = ({ mapAPI, border = true }) => {
  const { activeLayer, setSearchParamKey, UI } = useMapSettingsUI(mapAPI);
  const { Input } = UI;

  if (!activeLayer) return null;

  return (
    <InlineField label="Key Search Param" border={border}>
      <div className="w-[9.5rem] max-w-[42vw]">
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
  const { activeLayer, interactiveFilterOptions, activeFilter, setInteractiveSearchParamValue, activateInteractiveFilter, UI } = useMapSettingsUI(mapAPI);
  const { Input, Switch } = UI;
  const filters = interactiveFilterOptions || [];

  if (!activeLayer || !filters.length) return <div className={emptyStateClassName}>No interactive filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {filters.map((filter, index) => (
        <div key={`${filter.label || "interactive"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup title={filter.label || `Interactive Filter ${index + 1}`} highlighted={index > 0}>
            <Field label="Search Param Value" compact>
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
  const { activeLayer, dynamicFilterOptions, setDynamicSearchParamKey, setDynamicDefaultValue, setDynamicDataType, UI, Select } = useMapSettingsUI(mapAPI);
  const { Input } = UI;
  const filters = dynamicFilterOptions || [];

  if (!activeLayer || !filters.length) return <div className={emptyStateClassName}>No dynamic filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {filters.map((filter, index) => (
        <div key={`${filter.column_name || "dynamic"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup title={filter.display_name || filter.column_name || `Dynamic Filter ${index + 1}`} highlighted={index > 0}>
            <Field label="Search Param Value" compact>
              <DebouncedTextInput
                Input={Input}
                value={filter.searchParamKey || filter.column_name || ""}
                delay={500}
                onCommit={(value) => setDynamicSearchParamKey(index, value)}
              />
            </Field>
            <Field label="Default Value" compact>
              <DebouncedTextInput
                Input={Input}
                value={filter.defaultValue ?? ""}
                delay={500}
                onCommit={(value) => setDynamicDefaultValue(index, value)}
              />
            </Field>
            <Field label="Type" compact={false}>
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
  const { activeLayer, isSelectedVariableMappingsEnabled, selectedVariableMappings, setClickFilterUseSearchParam, UI } = useMapSettingsUI(mapAPI);
  const { Switch, Input } = UI;
  const mappings = isSelectedVariableMappingsEnabled ? selectedVariableMappings || [] : [];

  if (!activeLayer || !mappings.length) return <div className={emptyStateClassName}>No layer click filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {mappings.map((mapping, index) => (
        <div key={`${mapping.variable || "mapping"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup title={null} highlighted={index > 0}>
          <Field label="Selected Variable" compact>
            <StaticFieldValue value={mapping.variable || "Untitled variable"} />
          </Field>
            <ToggleRow
              label="Use URL Param"
              border={false}
              value={Boolean(mapping.useSearchParams)}
              onChange={(enabled) => setClickFilterUseSearchParam(index, enabled)}
              SwitchComp={Switch}
            />
          <Field label="Layer Field" compact={false}>
            <StaticFieldValue value={mapping.field || "-"} />
          </Field>
          </FilterGroup>
        </div>
      ))}
    </div>
  );
};

export const MapControls = () => ({
  default: [
    { key: "map_symbology", label: "Symbology", type: ({ mapAPI }) => <MapSymbologyControl mapAPI={mapAPI} /> },
    { key: "map_layer", label: "Layer", type: ({ mapAPI }) => <MapLayerControl mapAPI={mapAPI} /> },
    {
      key: "map_filters_nav",
      label: "Filters",
      items: [
        { key: "map_use_page_filters", label: "Use Page Filters", type: ({ mapAPI }) => <MapUsePageFiltersControl mapAPI={mapAPI} border={false} /> },
        { key: "map_key_search_param", label: "Key Search Param", type: ({ mapAPI }) => <MapKeySearchParamControl mapAPI={mapAPI} border={true} /> },
        {
          key: "map_interactive_filters_nav",
          label: "Interactive Filter",
          items: [
            { key: "map_interactive_filters", label: "Interactive Filter Details", type: ({ mapAPI }) => <MapInteractiveFiltersControl mapAPI={mapAPI} /> },
          ],
        },
        {
          key: "map_dynamic_filters_nav",
          label: "Dynamic Filter",
          items: [
            { key: "map_dynamic_filters", label: "Dynamic Filter Details", type: ({ mapAPI }) => <MapDynamicFiltersControl mapAPI={mapAPI} /> },
          ],
        },
        {
          key: "map_click_filters_nav",
          label: "Layer Click Filter",
          items: [
            { key: "map_click_filters", label: "Layer Click Filter Details", type: ({ mapAPI }) => <MapLayerClickFiltersControl mapAPI={mapAPI} /> },
          ],
        },
      ],
    },
    { key: "map_height", label: "Height", type: ({ mapAPI }) => <MapHeightControl mapAPI={mapAPI} /> },
    { key: "map_legend_position", label: "Legend Position", type: ({ mapAPI }) => <MapLegendPositionControl mapAPI={mapAPI} /> },
    { key: "map_plugin_control_position", label: "Plugin Control Position", type: ({ mapAPI }) => <MapPluginControlPositionControl mapAPI={mapAPI} /> },
    { key: "map_zoom_pan", label: "Zoom/pan", type: ({ mapAPI }) => <MapZoomPanControl mapAPI={mapAPI} /> },
    { key: "map_initial_viewport", label: "Set initial viewport", type: ({ mapAPI }) => <MapInitialViewportControl mapAPI={mapAPI} /> },
    { key: "map_blank_basemap", label: "Use blank basemap", type: ({ mapAPI }) => <MapBlankBasemapControl mapAPI={mapAPI} /> },
    { key: "map_zoom_to_fit", label: "Zoom to Fit", type: ({ mapAPI }) => <MapZoomToFitControl mapAPI={mapAPI} /> },
  ],
});
