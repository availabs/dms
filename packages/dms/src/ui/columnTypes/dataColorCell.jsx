import React from "react";
import { scaleLinear } from "d3-scale";
import { ThemeContext, getComponentTheme } from "../useTheme";

// data_color_cell column type — a heat cell whose BACKGROUND is the cell value
// mapped onto a colour-scale palette. The heat-grid companion to data_bar; build a
// month × region grid in a Spreadsheet by pivoting one column per category. The
// domain is data-driven: per-row from a set of sibling columns ("shade within each
// row") OR explicit min/max. Palette is themed (theme.dataColorCell.palette).
//
// Column attributes:
//   domainColumns  : array of sibling column names whose row values define the
//                    per-row [min,max] domain (within-row shading). OR
//   colorMin / colorMax            : static domain. OR
//   colorMinColumn / colorMaxColumn: sibling columns holding the domain bounds.
//   colors         : palette override (array of colour stops); default theme palette.
//   showValue      : render the value text over the colour (default false).
const dataColorCellDefault = {
  wrapper: "w-full h-5 rounded-[2px] flex items-center justify-center",
  value:   "text-[10px] tabular-nums leading-none",
  palette: ["#f1f5f9", "#94a3b8", "#1e293b"], // generic light → dark fallback
};

const num = (x) => parseFloat(x?.value ?? x);

export const DataColorCellView = ({ value, row, domainColumns, colorMin, colorMax, colorMinColumn, colorMaxColumn, colors, showValue }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...dataColorCellDefault, ...getComponentTheme(themeFromContext, "dataColorCell") };
  const palette = (Array.isArray(colors) && colors.length ? colors : t.palette) || [];

  const v = num(value);

  // Resolve the [lo, hi] domain. Per-row (domainColumns) is the within-row-shading
  // case; otherwise explicit static / sibling-column bounds.
  let lo, hi;
  if (Array.isArray(domainColumns) && domainColumns.length && row) {
    const vals = domainColumns.map((c) => num(row[c])).filter((n) => !Number.isNaN(n));
    lo = vals.length ? Math.min(...vals) : 0;
    hi = vals.length ? Math.max(...vals) : 1;
  } else {
    lo = colorMinColumn && row ? num(row[colorMinColumn]) : num(colorMin);
    hi = colorMaxColumn && row ? num(row[colorMaxColumn]) : num(colorMax);
  }
  if (Number.isNaN(lo)) lo = 0;
  if (Number.isNaN(hi)) hi = lo + 1;

  const scale = React.useMemo(() => {
    if (palette.length < 2) return () => palette[0] || "transparent";
    const span = (hi - lo) || 1;
    const domain = palette.map((_, i) => lo + (span * i) / (palette.length - 1));
    return scaleLinear().domain(domain).range(palette).clamp(true);
  }, [palette, lo, hi]);

  const bg = Number.isNaN(v) ? "transparent" : scale(v);

  return (
    <div className={t.wrapper} style={{ backgroundColor: bg }}>
      {showValue && !Number.isNaN(v) ? <span className={t.value}>{value?.value ?? value}</span> : null}
    </div>
  );
};

export const DataColorCellEdit = (props) => <DataColorCellView {...props} />;
