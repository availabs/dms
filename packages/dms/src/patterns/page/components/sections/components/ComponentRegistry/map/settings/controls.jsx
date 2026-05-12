import React, { useContext, useMemo, useState } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";

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

function MapSettingsSearchSelect({ options = [], value, onChange, placeholder = "Search...", disabled = false }) {
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => String(option.key) === String(value)) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const normalizedQuery = query.toLowerCase();
    return options.filter((option) => String(option.label || "").toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  return (
    <div className="mt-1">
      <Combobox
        value={selectedOption}
        onChange={(option) => {
          if (option && onChange) onChange(option.key);
        }}
        disabled={disabled}
      >
        <div className="relative z-[1] flex w-full items-center rounded-md border border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-within:z-[10050]">
          <i className="fa fa-search pr-2 text-xl font-light text-slate-400" aria-hidden="true" />
          <ComboboxInput
            className="w-full min-w-0 bg-transparent text-slate-900 outline-none placeholder:text-slate-300"
            displayValue={(option) => option?.label ?? ""}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
          <ComboboxButton className="px-1 text-slate-400 hover:text-slate-600">
            <i className="fa fa-chevron-down" aria-hidden="true" />
          </ComboboxButton>
          <ComboboxOptions className="absolute left-0 top-full z-[10050] mt-1 max-h-60 w-full overflow-auto rounded-md bg-white text-slate-900 shadow-lg ring-1 ring-zinc-950/5 empty:invisible">
            {filteredOptions.map((option, index) => (
              <ComboboxOption
                key={`${option.key}_${index}`}
                value={option}
                className="block cursor-pointer px-3 py-1.5 text-sm text-slate-900 data-[focus]:bg-slate-100 data-[selected]:bg-blue-50 data-[selected]:font-medium"
              >
                {option.label}
              </ComboboxOption>
            ))}
            {filteredOptions.length === 0 ? <div className="px-3 py-2 text-sm italic text-slate-400">No matches</div> : null}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}

const useMapSettingsUI = (mapAPI) => {
  const { UI } = useContext(ThemeContext) || { UI: {} };
  const controls = useMapSettingsControls(mapAPI);
  return { ...controls, UI };
};

const MapSymbologyControl = ({ mapAPI }) => {
  const { selectedSymbology, symbologyOptions, onSymbologyChange } = useMapSettingsUI(mapAPI);

  return (
    <div className={sectionClassName}>
      <Field label="Symbology">
        <MapSettingsSearchSelect
          value={selectedSymbology || ""}
          onChange={onSymbologyChange}
          placeholder="Search..."
          options={symbologyOptions}
        />
      </Field>
    </div>
  );
};

const MapLayerControl = ({ mapAPI }) => {
  const { selectedSymbology, selectedLayer, layerOptions, onLayerChange } = useMapSettingsUI(mapAPI);

  return (
    <Field label="Layer">
      <MapSettingsSearchSelect
        value={selectedLayer}
        onChange={onLayerChange}
        placeholder="Search..."
        options={layerOptions}
        disabled={!selectedSymbology}
      />
    </Field>
  );
};

const MapHeightControl = ({ mapAPI }) => {
  const { state, heightOptions, setHeight, UI } = useMapSettingsUI(mapAPI);
  const { Select } = UI;

  return (
    <InlineField label="Height" border={false}>
      <div className="w-[8rem] max-w-[40vw]">
        <Select
          value={state.height}
          options={heightOptions.map((option) => ({ label: option, value: option }))}
          onChange={(event) => setHeight(event.target.value)}
        />
      </div>
    </InlineField>
  );
};

const MapLegendPositionControl = ({ mapAPI }) => {
  const { state, panelPositionOptions, setLegendPosition, UI } = useMapSettingsUI(mapAPI);
  const { Select } = UI;

  return (
    <InlineField label="Legend Position">
      <div className="w-[9.5rem] max-w-[42vw]">
        <Select
          value={state.legendPosition}
          options={panelPositionOptions.map((option) => ({ label: option, value: option }))}
          onChange={(event) => setLegendPosition(event.target.value)}
        />
      </div>
    </InlineField>
  );
};

const MapPluginControlPositionControl = ({ mapAPI }) => {
  const { state, arePluginsLoaded, panelPositionOptions, setPluginControlPosition, UI } = useMapSettingsUI(mapAPI);
  const { Select } = UI;

  if (!arePluginsLoaded) return null;

  return (
    <InlineField label="Plugin Control Position">
      <div className="w-[9.5rem] max-w-[42vw]">
        <Select
          value={state.pluginControlPosition}
          options={panelPositionOptions.map((option) => ({ label: option, value: option }))}
          onChange={(event) => setPluginControlPosition(event.target.value)}
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
        <Input type="text" value={activeLayer?.searchParamKey || ""} onChange={(event) => setSearchParamKey(event.target.value)} />
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
                <Input type="text" value={filter.searchParamValue || filter.label || ""} onChange={(event) => setInteractiveSearchParamValue(index, event.target.value)} />
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
  const { activeLayer, dynamicFilterOptions, setDynamicSearchParamKey, setDynamicDefaultValue, setDynamicDataType, UI } = useMapSettingsUI(mapAPI);
  const { Input, Select } = UI;
  const filters = dynamicFilterOptions || [];

  if (!activeLayer || !filters.length) return <div className={emptyStateClassName}>No dynamic filters configured</div>;

  return (
    <div className={`${sectionClassName} w-full min-w-0`}>
      {filters.map((filter, index) => (
        <div key={`${filter.column_name || "dynamic"}_${index}`} className={`${index === 0 ? "" : "mt-3"} w-full min-w-0`}>
          <FilterGroup title={filter.display_name || filter.column_name || `Dynamic Filter ${index + 1}`} highlighted={index > 0}>
            <Field label="Search Param Value" compact>
              <Input type="text" value={filter.searchParamKey || filter.column_name || ""} onChange={(event) => setDynamicSearchParamKey(index, event.target.value)} />
            </Field>
            <Field label="Default Value" compact>
              <Input type="text" value={filter.defaultValue ?? ""} onChange={(event) => setDynamicDefaultValue(index, event.target.value)} />
            </Field>
            <Field label="Type" compact={false}>
              <Select
                value={filter.dataType || ""}
                options={[
                  { label: "String", value: "" },
                  { label: "Numeric", value: "numeric" },
                ]}
                onChange={(event) => setDynamicDataType(index, event.target.value)}
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
