// Default theme for the flow_step column type (flow_step.jsx); sites override via theme.flowStep.
export const flowStepTheme = {
  wrapper: "w-full h-full flex items-center",
  box: "flex-1 min-w-0 h-full rounded-md border border-slate-200 bg-slate-50/60 p-3 flex items-center gap-2",
  boxTint: "flex-1 min-w-0 h-full rounded-md border border-emerald-200 bg-emerald-50/50 p-3 flex items-center gap-2",
  // a step that sits beside the flow rather than in it (stepDashed)
  boxDashed: "flex-1 min-w-0 h-full rounded-md border border-dashed border-slate-300 p-3 flex items-center gap-2",
  // the label and its stepNote, stacked
  labelStack: "min-w-0 flex flex-col",
  note: "text-[11px] text-slate-500 truncate",
  dot: "size-2.5 rounded-full shrink-0",
  dots: { neutral: "bg-slate-300", info: "bg-sky-400", warn: "bg-amber-400", done: "bg-emerald-500" },
  label: "font-medium text-[12.5px] text-slate-700 truncate",
  count: "ml-auto pl-2 font-semibold text-[18px] tabular-nums text-slate-900",
  connector: "shrink-0 text-slate-300 text-[16px] pl-1 -mr-1 select-none",
};
