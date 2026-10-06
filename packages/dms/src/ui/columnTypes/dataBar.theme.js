// Default theme for the data_bar column type (dataBar.jsx); sites override via theme.dataBar.
export const dataBarTheme = {
  wrapper: "w-full flex items-center gap-2",
  track:   "relative flex-1 min-w-0 h-3 rounded bg-slate-100 overflow-hidden",
  fill:    "absolute inset-y-0 left-0 rounded transition-[width] duration-300",
  value:   "shrink-0 font-mono text-[10.5px] tabular-nums text-slate-500",
  // key → fill colour class. Site themes override these (and may add keys).
  fills:   { primary: "bg-blue-700", muted: "bg-slate-400" },
};
