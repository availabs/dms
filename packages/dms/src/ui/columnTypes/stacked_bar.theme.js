// Default theme for the stacked_bar column type (stacked_bar.jsx); sites override via theme.stackedBar.
export const stackedBarTheme = {
  wrapper: "w-full",
  track: "w-full flex h-2 rounded bg-slate-200 overflow-hidden",
  segment: "h-full shrink-0",
  legend: "pt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 tabular-nums",
  empty: "pt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400",
  // key → segment colour class for non-literal `color` values. Site themes override
  // these (and may add keys).
  fills: { primary: "bg-blue-700", muted: "bg-slate-400" },
};
