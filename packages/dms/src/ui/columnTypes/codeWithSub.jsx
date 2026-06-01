import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";

// code_with_sub column type — renders a single value formatted as
// `<code>|||<sublabel>` as two inline-styled parts: a prominent uppercase
// "code" (e.g. "CDTC") and a muted "sublabel" (e.g. "Capital District").
// Reusable on any compliance/identifier table where each row's identity is
// an org short code + its location. Keeps the data in ONE SQL column (cleaner
// GROUP BY) while the rendering carries the two-part typography.
//
// SQL pattern:
//   case when mpo_name like 'Capital District%' then 'CDTC|||Capital District'
//        when mpo_name like 'Greater Buffalo%' then 'GBNRTC|||Buffalo-Niagara'
//        ... else mpo_name end as mpo_label
//
// If the value contains no `|||`, the whole string renders as a single code
// (no sublabel) — so unmapped rows still render readably with the raw value.
//
// Theme keys (override via `theme.code_with_sub`):
//   wrapper / code / sub
const codeWithSubDefault = {
  wrapper: "inline-flex items-baseline gap-1.5",
  code:    "font-display uppercase text-[12px] tracking-[0.06em] text-[#0f1722]",
  sub:     "font-proxima normal-case tracking-normal text-slate-400 text-[11px]",
};

const SEP = "|||";

export const CodeWithSubView = ({ value }) => {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...codeWithSubDefault, ...getComponentTheme(themeFromContext, "code_with_sub") };

  if (value === null || value === undefined || value === "") return null;
  const v = String(value);
  if (!v.includes(SEP)) {
    return <span className={t.wrapper}><span className={t.code}>{v}</span></span>;
  }
  const [code, sub] = v.split(SEP, 2);
  return (
    <span className={t.wrapper}>
      <span className={t.code}>{code}</span>
      {sub ? <span className={t.sub}>{sub}</span> : null}
    </span>
  );
};

export const CodeWithSubEdit = (props) => <CodeWithSubView {...props} />;
