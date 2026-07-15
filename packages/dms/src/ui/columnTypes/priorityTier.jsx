import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { MultiSelectEdit } from "../components/MultiSelect";

// priority_tier column type — renders a ranked tier as a pill made of a small
// numeral BADGE (the rank, 1..N) + a SHORT LABEL (the tier name with its leading
// "Tier N – " prefix stripped). Editable in view exactly like `status_pill` (pill in
// view, single-select dropdown on click) via `allowEditInView`. Sibling of
// `status_pill`: same MultiSelectEdit-reuse contract, but this type is RANKED and
// keeps unset rows CLICKABLE — where `status_pill` returns null for empty (blank AND
// uneditable) and its rounded-full wrapper turns long tier strings into blobs, this
// type renders a dashed "Set priority" chip for the empty / "Please Select..." value
// and truncates the short label so it never wraps.
//
// Reads ONLY its own value (rung-3 "look depends on the value") and delegates the
// OUTER pill treatment to the shared UI.Pill primitive — a site theme re-skins every
// tier by defining `theme.pill` styles named `tier_1..tier_N` / `tier_unset` (the mny
// theme does). The inner numeral-badge + short-label LAYOUT is structural and rendered
// here; its default per-rank badge tints live in `priorityTierDefault` (neutral
// Tailwind palette, no brand hex) and a site theme overrides them via
// `theme.priority_tier`.
//
// Column attributes (set per-column in the Spreadsheet/Card toolbar):
//   options      : [{label, value}] — the tier values (drives the edit dropdown and
//                  the index-based rank fallback).
//   tierRank /   : value → integer rank for the badge. May be a function (value)=>int
//   rankFrom       or an object map { "<value>": <int> }. Default: parse a leading
//                  "Tier <N>" out of the value; else its index in `options` (+1).
//   shortLabel   : value → short pill label. May be a function (value)=>string or an
//                  object map { "<value>": "<label>" }. Default: strip a leading
//                  "Tier N – " / "Tier N - " prefix.
//   pillColors   : { "<value>": "<theme.pill style>" } — explicit per-value pill style;
//                  else the style is derived from rank (rank r → "tier_r", unset →
//                  "tier_unset").
//   allowEditInView : honoured exactly as `status_pill` does (view = pill, click =
//                  single-select dropdown, pick = new pill).
const priorityTierDefault = {
  // inner numeral badge: a small filled circle carrying the rank number
  badge: "inline-flex items-center justify-center shrink-0 size-[18px] rounded-full text-[10px] font-semibold leading-none tabular-nums",
  // short label sits next to the badge; `truncate` (whitespace-nowrap) keeps a long
  // tier string on one line so it never wraps into a multi-line blob
  label: "truncate",
  // text of the dashed unset chip
  setLabel: "Set priority",
  // per-rank badge fills — library defaults (neutral Tailwind palette, amber → steel);
  // override via theme.priority_tier.rankBadge to re-skin per brand
  rankBadge: {
    1: "bg-amber-500 text-white",
    2: "bg-sky-500 text-white",
    3: "bg-slate-400 text-white",
    4: "bg-slate-300 text-slate-700",
  },
};

// the empty / sentinel value that means "no tier chosen yet"
const isUnset = (value) => {
  const v = (value ?? "").toString().trim();
  return !v || v.toLowerCase() === "please select...";
};

// value → integer rank. function / object-map attribute wins; else parse "Tier <N>";
// else the value's index in `options` (+1); else null.
const rankOf = (value, { tierRank, rankFrom, options } = {}) => {
  const v = (value ?? "").toString().trim();
  if (!v) return null;
  const mapper = tierRank ?? rankFrom;
  if (typeof mapper === "function") {
    const r = parseInt(mapper(v), 10);
    if (!Number.isNaN(r)) return r;
  } else if (mapper && typeof mapper === "object" && mapper[v] != null) {
    const r = parseInt(mapper[v], 10);
    if (!Number.isNaN(r)) return r;
  }
  const m = v.match(/^\s*tier\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (Array.isArray(options)) {
    const idx = options.findIndex((o) => (o?.value ?? o) === v || (o?.label ?? o) === v);
    if (idx !== -1) return idx + 1;
  }
  return null;
};

// value → short label. function / object-map attribute wins; else strip a leading
// "Tier N – " / "Tier N - " (en-dash, em-dash or hyphen) prefix.
const PREFIX_RE = /^\s*tier\s*\d+\s*[-–—]\s*/i;
const shortLabelOf = (value, { shortLabel } = {}) => {
  const v = (value ?? "").toString();
  if (typeof shortLabel === "function") return shortLabel(v);
  if (shortLabel && typeof shortLabel === "object" && shortLabel[v] != null) return shortLabel[v];
  return v.replace(PREFIX_RE, "").trim() || v;
};

// pick the OUTER pill style name: explicit per-value map wins, else derive from rank.
const pillStyleFor = (value, rank, pillColors) => {
  const v = (value ?? "").toString().trim();
  if (pillColors && pillColors[v]) return pillColors[v];
  if (rank && rank >= 1) return `tier_${rank}`;
  return "tier_unset";
};

export const PriorityTierView = ({ value, options, pillColors, tierRank, rankFrom, shortLabel, onClick }) => {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const Pill = UI?.Pill;
  const t = { ...priorityTierDefault, ...getComponentTheme(themeFromContext, "priority_tier") };
  if (!Pill) return null;

  // Unset: a dashed "Set priority" chip that is CLICKABLE (onClick from the cell) and
  // NOT null — so unset rows stay visible and editable, unlike status_pill's blank.
  if (isUnset(value)) {
    return <Pill activeStyle="tier_unset" text={t.setLabel} onClick={onClick} />;
  }

  const rank = rankOf(value, { tierRank, rankFrom, options });
  const label = shortLabelOf(value, { shortLabel });
  const pillStyle = pillStyleFor(value, rank, pillColors);
  const badgeTint = rank && t.rankBadge?.[rank] ? t.rankBadge[rank] : "";

  return (
    <Pill
      activeStyle={pillStyle}
      text={
        <>
          {rank ? <span className={`${t.badge} ${badgeTint}`}>{rank}</span> : null}
          <span className={t.label}>{label}</span>
        </>
      }
    />
  );
};

// Edit reuses MultiSelectEdit (singleSelectOnly) so an `allowEditInView` priority_tier
// column is EDITABLE while keeping its pill look — mirrors StatusPillEdit. Options come
// from `options` if present, else are derived from the `pillColors` keys. Each option's
// display is its PriorityTierView pill (via `meta`), so the trigger and menu rows show
// tier pills, not plain text; the derivation attributes are threaded through so the
// dropdown pills match the in-cell pill exactly. MultiSelectEdit persists a clean scalar
// string, not an array. When the options include a "Please Select..." / empty row,
// picking it clears the tier (View then renders the dashed "Set priority" chip).
export const PriorityTierEdit = (props) => {
  const { options, pillColors, tierRank, rankFrom, shortLabel } = props;
  const opts = (options && options.length)
    ? options
    : Object.keys(pillColors || {}).map((v) => ({ label: v, value: v }));
  const meta = {};
  for (const o of opts) {
    const v = o.value ?? o;
    meta[o.label ?? v] = (
      <PriorityTierView
        value={v}
        options={opts}
        pillColors={pillColors}
        tierRank={tierRank}
        rankFrom={rankFrom}
        shortLabel={shortLabel}
      />
    );
  }
  return <MultiSelectEdit {...props} options={opts} meta={meta} singleSelectOnly={true} />;
};
