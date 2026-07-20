const defaultMapStyle = {
  name: "default",
  zoomInIcon: "Plus",
  zoomOutIcon: "Minus",
  compassIcon: "NavigationArrow",
  mapStyleIcon: "MapLayers",
  homeIcon: "Home",
  loadingIcon: "Spinner",
  settingsIcon: "Settings",
  closeIcon: "XMark",
  legend: {
    panel: "p-4",
    panelInner: "relative min-h-10 max-h-[calc(100vh_-_111px)] overflow-auto bg-white/75 pointer-events-auto scrollbar-sm",
    // header renders only when set — style 0 stays headerless for BC
    header: "",
    headerTitle: "",
    headerMeta: "",
    section: "m-1 rounded p-1",
    row: "border border-transparent",
    rowHover: "hover:border-pink-500 hover:bg-pink-50",
    rowActive: "bg-pink-100",
    titleRow: "group/title flex w-full items-center p-2 py-1",
    title: "flex-1 text-sm text-slate-600 font-medium truncate",
    columnTag: "",
    label: "flex items-center text-center flex-1 px-4 text-slate-500 h-6 text-sm truncate",
    secondaryLabel: "flex h-4 justify-self-end text-xs",
    groupLabel: "text-slate-600 font-medium truncate flex-1",
    groupMetaLabel: "text-xs text-black",
    symbolWrapper: "flex h-6 w-10 items-center justify-center",
    symbolFill: "w-4 h-4 rounded",
    symbolCircle: "w-3 h-3 rounded-full",
    symbolLine: "h-1 w-4",
    // rampTrack renders the horizontal choropleth ramp only when set — style 0
    // keeps the classic vertical step rows
    rampTrack: "",
    rampTicks: "",
    horizontalPanel: "w-full max-h-[350px] overflow-x-auto scrollbar-sm",
    horizontalTrack: "flex-1 flex w-full p-2",
    loading: "flex w-full justify-center overflow-hidden pb-2",
    empty: "text-slate-500 text-sm",
    infoIcon: "text-slate-300 group-hover/icon:text-pink-800",
    infoButton: "size-5 shrink-0 inline-flex items-center justify-center rounded text-slate-400 hover:text-pink-700 hover:bg-pink-50 cursor-pointer",
    controlButton: "cursor-pointer group-hover:fill-gray-400 group-hover:hover:fill-pink-700",
    controlButtonActive: "fill-pink-100",
    controlButtonInactive: "fill-white",
    controlButtonReveal: "collapse group-hover:visible",
    selectorBox: "rounded-md h-[36px] pl-0 flex w-full w-[216px] items-center border border-transparent cursor-pointer hover:border-slate-300",
  },
  popup: {
    panel: "rounded-md bg-white shadow-lg ring-1 ring-black/5",
    infoPanel: "w-64 rounded-md bg-white shadow-lg ring-1 ring-black/5 px-2 py-2 flex gap-2 flex-col",
    menuPanel: "rounded-md bg-white shadow-lg ring-1 ring-black/5",
    listPanel: "w-48 rounded-md bg-white shadow-lg ring-1 ring-black/5 p-2 max-h-[250px] overflow-auto",
    listItem: "group flex w-full items-center rounded-md px-1 py-1 text-sm hover:bg-pink-50",
    listItemText: "truncate flex items-center text-[15px] px-4 py-1",
  },
  hover: {
    panel: "bg-white p-4 max-h-64 w-[300px] min-w-[300px] max-w-[300px] scrollbar-xs overflow-y-scroll",
    title: "font-medium pb-1 w-full border-b",
    row: "flex border-b pt-1",
    label: "flex-1 font-medium text-xs text-slate-400 pl-1",
    value: "flex-1 text-right text-sm font-thin pl-4 pr-1",
    removeButton: "rounded absolute inline-block top-0 bg-white hover:text-blue-500 cursor-pointer",
    pointer: "absolute w-6 h-6 rounded-bl rounded-tr bg-white top-0 left-0 z-10",
  },
};

const currentDefault2Style = {
  name: "default_2",
  zoomInIcon: "Plus",
  zoomOutIcon: "Minus",
  compassIcon: "NavigationArrow",
  mapStyleIcon: "MapLayers",
  homeIcon: "Home",
  loadingIcon: "Spinner",
  settingsIcon: "Settings",
  closeIcon: "XMark",
  legend: {
    panel: "p-4",
    panelInner:
      "relative w-72 min-h-10 max-h-[calc(100vh_-_111px)] overflow-auto rounded-lg border border-zinc-950/10 bg-white shadow-lg pointer-events-auto scrollbar-sm",
    header: "h-9 px-3 flex items-center gap-2 border-b border-zinc-950/10 bg-slate-50/80 sticky top-0 z-10",
    headerTitle: "flex-1 text-[13px] font-medium text-slate-700",
    headerMeta: "font-mono text-[9.5px] uppercase tracking-wider text-slate-500",
    section: "",
    row: "px-3 pt-2.5 pb-2 border-b border-zinc-950/5 last:border-0",
    rowHover: "",
    rowActive: "bg-blue-500/5",
    titleRow: "group/title flex w-full items-center gap-2 mb-1.5",
    title: "flex-1 text-[12px] font-semibold text-slate-900 truncate",
    columnTag: "font-mono text-[9px] uppercase tracking-wider text-slate-400 shrink-0",
    listRow: "flex w-full items-center",
    label: "flex h-5 flex-1 items-center truncate px-2 text-[11px] text-slate-600",
    secondaryLabel: "text-[10px] text-zinc-500",
    groupLabel: "truncate flex-1 font-medium text-zinc-700",
    groupMetaLabel: "text-xs text-zinc-500",
    symbolWrapper: "flex h-5 w-6 items-center",
    symbolFill: "h-2.5 w-3.5 rounded-sm",
    symbolCircle: "h-3 w-3 rounded-full border border-white shadow-sm",
    symbolLine: "h-1 w-4 rounded",
    rampTrack: "flex h-2 rounded overflow-hidden mb-1",
    rampTicks: "flex justify-between font-mono text-[9px] text-slate-500 tabular-nums",
    horizontalPanel: "w-full max-h-[350px] overflow-x-auto scrollbar-sm",
    horizontalTrack: "flex w-full flex-1 p-2",
    loading: "flex w-full justify-center overflow-hidden pb-2",
    empty: "text-sm text-zinc-500",
    infoIcon: "text-zinc-400 group-hover/icon:text-blue-600",
    infoButton: "size-5 shrink-0 inline-flex items-center justify-center rounded text-blue-700 hover:text-blue-800 hover:bg-blue-500/10 cursor-pointer",
    infoButtonFill: "fill-blue-600",
    controlButton:
      "cursor-pointer transition-colors group-hover:fill-zinc-500 group-hover:hover:fill-blue-600",
    controlButtonActive: "fill-blue-600",
    controlButtonInactive: "fill-zinc-300",
    controlButtonReveal: "collapse group-hover:visible",
    selectorBox:
      "rounded-md h-[36px] pl-0 flex w-full w-[216px] items-center border border-zinc-950/10 bg-white/95 cursor-pointer hover:border-zinc-950/20 hover:bg-blue-500/5",
  },
  popup: {
    panel: "rounded-lg border border-zinc-950/10 bg-white/95 shadow-sm",
    infoPanel:
      "flex w-64 flex-col gap-2 rounded-lg border border-zinc-950/10 bg-white/95 px-3 py-3 shadow-sm",
    menuPanel: "divide-y divide-zinc-100 rounded-lg border border-zinc-950/10 bg-white/95 shadow-sm",
    listPanel: "w-48 max-h-[250px] overflow-auto rounded-lg border border-zinc-950/10 bg-white/95 p-2 shadow-sm",
    listItem:
      "group flex w-full items-center rounded-md px-1 py-1 text-sm text-zinc-700 hover:bg-blue-500/10 hover:text-blue-700",
    listItemText: "truncate flex items-center px-4 py-1 text-[15px]",
  },
  hover: {
    panel: "w-[300px] min-w-[300px] max-w-[300px] max-h-64 overflow-y-auto rounded-lg border border-zinc-950/10 bg-white p-3 shadow-lg scrollbar-xs",
    title: "w-full border-b border-zinc-950/10 pb-1.5 mb-1 text-[12px] font-semibold text-slate-900 truncate",
    row: "flex border-b border-zinc-950/5 py-1 last:border-0",
    label: "flex-1 pl-1 font-mono text-[10px] uppercase tracking-wide text-slate-500 self-center",
    value: "flex-1 pl-4 pr-1 text-right text-[12px] font-medium text-slate-800 tabular-nums",
    removeButton:
      "rounded absolute inline-block top-0 bg-white text-zinc-500 border border-zinc-950/10 shadow-sm cursor-pointer hover:text-blue-500",
    pointer: "absolute w-6 h-6 rounded-bl rounded-tr bg-white border-r border-b border-zinc-950/10 top-0 left-0 z-10",
  },
};

const createMapStyle = (style = defaultMapStyle) => ({
  ...style,
  legend: { ...(style.legend || {}) },
  popup: { ...(style.popup || {}) },
  hover: { ...(style.hover || {}) },
});

const getEditableMapThemePaths = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return getEditableMapThemePaths(value, `${prefix}${key}.`);
    }
    return [{ label: `${prefix}${key}`, path: `${prefix}${key}` }];
  });

export const mapTheme = {
  options: {
    activeStyle: 0,
  },
  styles: [
    createMapStyle(),
    createMapStyle(currentDefault2Style),
  ],
};

export const mapSettings = (theme) => {
  const activeStyle = theme?.map?.options?.activeStyle || 0;
  const currentStyle = theme?.map?.styles?.[activeStyle] || mapTheme.styles[0];
  const editablePaths = getEditableMapThemePaths(currentStyle);

  return [
    {
      label: "Map Styles",
      type: "inline",
      controls: [
        {
          label: "Style",
          type: "MultiSelect",
          singleSelectOnly: true,
          searchable: false,
          options: (theme?.map?.styles?.length ? theme.map.styles : mapTheme.styles).map((style, index) => ({
            label: style?.name || index,
            value: index,
          })),
          path: "map.options.activeStyle",
        },
        {
          label: "Add Style",
          type: "Button",
          children: "Add Style",
          onClick: (e, setState) => {
            setState((draft) => {
              if (!draft.map) draft.map = { ...mapTheme };
              if (!draft.map.styles?.length) draft.map.styles = [createMapStyle()];
              draft.map.styles.push({
                ...createMapStyle(draft.map.styles[0]),
                name: "new map style",
              });
              draft.map.options.activeStyle = draft.map.styles.length - 1;
            });
          },
        },
        {
          label: "Remove Style",
          type: "Button",
          children: "Remove Style",
          onClick: (e, setState) => {
            setState((draft) => {
              if (draft.map?.styles?.length > 1) {
                draft.map.styles.splice(activeStyle, 1);
                draft.map.options.activeStyle = 0;
              }
            });
          },
        },
      ],
    },
    {
      label: "Map Theme",
      type: "inline",
      controls: editablePaths.map(({ label, path }) => ({
        label,
        type: "Textarea",
        path: `map.styles[${activeStyle}].${path}`,
      })),
    },
  ];
};
