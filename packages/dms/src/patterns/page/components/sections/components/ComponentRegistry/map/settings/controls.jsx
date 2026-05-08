import React, { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";

import RenderSwitch from "../tmp-cache-files/Switch.jsx";
import useMapSettingsControls from "./state.jsx";

const PAGES = {
  root: "root",
  filters: "filters",
  interactive: "interactive",
  dynamic: "dynamic",
  click: "click",
};

const labelClassName = "text-sm font-medium text-slate-100";
const inputClassName =
  "mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-500";
const comboBoxClassName =
  "mt-1 w-full rounded-md border border-slate-700 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500";
const sectionClassName = "pt-1.5 first:pt-0";
const pageClassName = "w-full px-4 pb-3 text-slate-100";
const repeatedSectionClassName = "border-t border-slate-800 pt-1.5";
const rowSectionClassName = "pt-0";

/**
 * Renders the title for an inner Map Settings screen.
 * The outer Settings shell owns the main breadcrumb/header, so these titles stay local.
 */
const PageTitle = ({ title }) => (
  <div className="pb-2">
    <div className="pb-1 text-xl font-semibold text-slate-100">{title}</div>
  </div>
);

/**
 * Shared field wrapper for stacked label/input sections in the settings panel.
 */
const Field = ({ label, children, compact = false }) => (
  <div className={compact ? "pb-1.5" : "pb-2"}>
    <label className={labelClassName}>{label}</label>
    {children}
  </div>
);

/**
 * Navigation row used for screens that drill into deeper map settings.
 */
const RowLink = ({ label, value, onClick, disabled = false }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    className={`flex w-full items-center justify-between border-t border-slate-800 py-2.5 text-left text-base ${
      disabled ? "cursor-not-allowed text-slate-500" : "text-slate-100"
    }`}
  >
    <span>{label}</span>
    <span className="flex items-center gap-3 text-slate-300">
      {value ? <span>{value}</span> : null}
      <span aria-hidden="true">›</span>
    </span>
  </button>
);

/**
 * Simple label/switch row for boolean map display settings.
 */
const ToggleRow = ({ label, value, onChange, border = true, labelClassName = "text-base text-slate-100" }) => (
  <div className={`${border ? "border-t border-slate-800" : ""} flex items-center justify-between py-2.5`}>
    <span className={labelClassName}>{label}</span>
    <RenderSwitch enabled={Boolean(value)} setEnabled={onChange} />
  </div>
);

const STEP_META = {
  [PAGES.filters]: { title: "Filters", contextLabel: "Map Settings" },
  [PAGES.interactive]: { title: "Interactive Filter", contextLabel: "Map Settings / Filters" },
  [PAGES.dynamic]: { title: "Dynamic Filter", contextLabel: "Map Settings / Filters" },
  [PAGES.click]: { title: "Layer Click Filter", contextLabel: "Map Settings / Filters" },
};

/**
 * Searchable select used by the symbology and layer pickers.
 * It mirrors the existing map selection flow while fitting the settings panel UI.
 */
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
    <Combobox
      value={selectedOption}
      onChange={(option) => {
        if (option && onChange) onChange(option.key);
      }}
      disabled={disabled}
    >
      <div className={`relative z-[1] flex w-full items-center ${comboBoxClassName} focus-within:z-[10050]`}>
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
  );
}

/**
 * Main Map Settings panel and its inner screens.
 * This keeps the refactored settings UI aligned with the existing map config handlers.
 */
function MapSettingsPanel({ dwAPI, isInMenu = false }) {
  const [step, setStep] = useState(PAGES.root);
  const {
    state,
    heightOptions,
    panelPositionOptions,
    setHeight,
    setLegendPosition,
    setZoomPan,
    setInitialBounds,
    setBlankBasemap,
    setZoomToFitBounds,
    selectedSymbology,
    symbologyOptions,
    onSymbologyChange,
    selectedLayer,
    layerOptions,
    onLayerChange,
    activeLayer,
    interactiveFilterOptions,
    dynamicFilterOptions,
    selectedVariableMappings,
    isSelectedVariableMappingsEnabled,
    activeFilter,
    interactiveCount,
    dynamicCount,
    clickCount,
    totalFilterItems,
    setUsePageFilters,
    setSearchParamKey,
    setInteractiveSearchParamValue,
    activateInteractiveFilter,
    setDynamicSearchParamKey,
    setDynamicDefaultValue,
    setDynamicDataType,
    setClickFilterUseSearchParam,
  } = useMapSettingsControls(dwAPI);

  const stepMeta = STEP_META[step];

  if (step === PAGES.filters) {
    return (
      <div className={pageClassName}>
        <PageTitle title={stepMeta.title} />

        {!activeLayer ? (
          <div className="text-sm text-slate-400">Select a layer first.</div>
        ) : (
          <>
            <div className={sectionClassName}>
              <ToggleRow label="Use Page Filters" border={false} value={activeLayer?.usePageFilters} onChange={setUsePageFilters} />
              <Field label="Key Search Param">
                <input className={inputClassName} type="text" value={activeLayer?.searchParamKey || ""} onChange={(event) => setSearchParamKey(event.target.value)} />
              </Field>
            </div>

            <div className={rowSectionClassName}>
              <RowLink label="Interactive Filter" value={`${interactiveCount}`} disabled={!interactiveCount} onClick={() => setStep(PAGES.interactive)} />
              <RowLink label="Dynamic Filter" value={`${dynamicCount}`} disabled={!dynamicCount} onClick={() => setStep(PAGES.dynamic)} />
              <RowLink label="Layer Click Filter" value={`${clickCount}`} disabled={!clickCount} onClick={() => setStep(PAGES.click)} />
            </div>
          </>
        )}
      </div>
    );
  }

  if (step === PAGES.interactive) {
    const filters = interactiveFilterOptions || [];

    return (
      <div className={pageClassName}>
        <PageTitle title={stepMeta.title} />

        {!activeLayer || !filters.length ? (
          <div className="text-sm text-slate-400">No interactive filters configured</div>
        ) : (
          filters.map((filter, index) => (
            <div key={`${filter.label || "interactive"}_${index}`} className={index === 0 ? sectionClassName : repeatedSectionClassName}>
              <div className="pb-2 text-base font-medium text-slate-100">{filter.label || `Interactive Filter ${index + 1}`}</div>
              <Field label="Search Param Value" compact>
                <input className={inputClassName} type="text" value={filter.searchParamValue || filter.label || ""} onChange={(event) => setInteractiveSearchParamValue(index, event.target.value)} />
              </Field>
              <ToggleRow
                label="Active"
                border={false}
                value={activeFilter === index}
                onChange={(enabled) => {
                  if (!enabled) return;
                  activateInteractiveFilter(index);
                }}
              />
            </div>
          ))
        )}
      </div>
    );
  }

  if (step === PAGES.dynamic) {
    const filters = dynamicFilterOptions || [];

    return (
      <div className={pageClassName}>
        <PageTitle title={stepMeta.title} />

        {!activeLayer || !filters.length ? (
          <div className="text-sm text-slate-400">No dynamic filters configured</div>
        ) : (
          filters.map((filter, index) => (
            <div key={`${filter.column_name || "dynamic"}_${index}`} className={index === 0 ? sectionClassName : repeatedSectionClassName}>
              <Field label="Search Param Value" compact>
                <input className={inputClassName} type="text" value={filter.searchParamKey || filter.column_name || ""} onChange={(event) => setDynamicSearchParamKey(index, event.target.value)} />
              </Field>
              <Field label="Default Value" compact>
                <input className={inputClassName} type="text" value={filter.defaultValue ?? ""} onChange={(event) => setDynamicDefaultValue(index, event.target.value)} />
              </Field>
              <Field label="Type" compact>
                <select className={inputClassName} value={filter.dataType || ""} onChange={(event) => setDynamicDataType(index, event.target.value)}>
                  <option value="">String</option>
                  <option value="numeric">Numeric</option>
                </select>
              </Field>
            </div>
          ))
        )}
      </div>
    );
  }

  if (step === PAGES.click) {
    const mappings = isSelectedVariableMappingsEnabled ? selectedVariableMappings || [] : [];

    return (
      <div className={pageClassName}>
        <PageTitle title={stepMeta.title} />

        {!activeLayer || !mappings.length ? (
          <div className="text-sm text-slate-400">No layer click filters configured</div>
        ) : (
          mappings.map((mapping, index) => (
            <div key={`${mapping.variable || "mapping"}_${index}`} className={index === 0 ? sectionClassName : repeatedSectionClassName}>
              <Field label="Selected Variable" compact>
                <div className={`${inputClassName} break-words text-slate-200`}>{mapping.variable || "Untitled variable"}</div>
              </Field>
              <ToggleRow label="Use URL Param" border={false} value={Boolean(mapping.useSearchParams)} onChange={(enabled) => setClickFilterUseSearchParam(index, enabled)} />
              <Field label="Layer Field" compact>
                <div className={`${inputClassName} break-words text-slate-200`}>{mapping.field || "-"}</div>
              </Field>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className={pageClassName}>
      <div className={sectionClassName}>
        <Field label="Symbology">
          <MapSettingsSearchSelect
            value={selectedSymbology || ""}
            onChange={onSymbologyChange}
            placeholder="Search..."
            options={symbologyOptions}
          />
        </Field>

        <Field label="Layer">
          <MapSettingsSearchSelect
            value={selectedLayer}
            onChange={onLayerChange}
            placeholder="Search..."
            options={layerOptions}
            disabled={!selectedSymbology}
          />
        </Field>
      </div>

      <div className="pt-2">
        <RowLink label="Filters" value={activeLayer ? `${totalFilterItems} items` : undefined} disabled={!activeLayer} onClick={() => setStep(PAGES.filters)} />
      </div>

      <div className={sectionClassName}>
        <Field label="Height">
          <select className={inputClassName} value={state.height} onChange={(event) => setHeight(event.target.value)}>
            {heightOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Legend Position">
          <select className={inputClassName} value={state.legendPosition} onChange={(event) => setLegendPosition(event.target.value)}>
            {panelPositionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={sectionClassName}>
        <ToggleRow label="Zoom/pan" border={false} value={state?.zoomPan} onChange={setZoomPan} />
        <ToggleRow
          label="Set initial viewport"
          value={state?.setInitialBounds}
          onChange={setInitialBounds}
          labelClassName="max-w-[9rem] text-base leading-5 text-slate-100"
        />
        <ToggleRow label="Use blank basemap" value={state?.blankBaseMap} onChange={setBlankBasemap} />
        <ToggleRow label="Zoom to Fit" value={state?.zoomToFitBounds} onChange={setZoomToFitBounds} />
      </div>
    </div>
  );
}

export const mapControls = {
  default: [
    {
      key: "mapSettings",
      type: ({ dwAPI }) => <MapSettingsPanel dwAPI={dwAPI} isInMenu={false} />,
    },
  ],
};
