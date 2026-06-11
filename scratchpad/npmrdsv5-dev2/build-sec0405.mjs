// Builds the 4 contextual lexical sections for §04 / §05 and writes each
// section's full `data` JSON to /tmp for `dms section create --data`.
import fs from "node:fs";

const GROUP = "230fb46d-1563-4a90-ab77-c9d9721ec63d";

const txt = (text, bold = false) => ({
  type: "text", version: 1, detail: 0,
  format: bold ? 1 : 0, mode: "normal", style: "", text,
});
const styled = (styleKey, children) => ({
  type: "styled-paragraph", version: 1, direction: "ltr", format: "",
  indent: 0, textFormat: 0, textStyle: "", styleKey, children,
});
const heading = (text, tag = "h2") => ({
  type: "heading", tag, version: 1, direction: "ltr", format: "", indent: 0,
  children: [txt(text)],
});
const lexical = (children) => JSON.stringify({
  bgColor: "rgba(0,0,0,0)", isCard: "", showToolbar: false,
  text: { root: { type: "root", version: 1, direction: "ltr", format: "", indent: 0, children } },
});

// A bare full-width header/note block (matches the §03 header 2173960 chrome).
const block = (children, padding = { top: "0", left: "2", right: "0", bottom: "0" }) => ({
  size: "12",
  type: "npmrds_sub|component",
  group: GROUP,
  level: null,
  title: "",
  bg: null,
  border: null,
  radius: null,
  padding,
  element: { "element-data": lexical(children), "element-type": "lexical" },
  "element-type": "lexical",
});

const sections = {
  sec04head: block([
    styled("kicker", [txt("// 04   Regional · MPO · CY 2025")]),
    heading("Who meets which target, region by region?"),
    styled("proseSM", [
      txt("MPOs adopt the statewide targets — each is scored against the "),
      txt("state", true),
      txt(" target. PHED columns are diagnostic (no MPO target)."),
    ]),
  ]),

  sec04foot: block([
    styled("proseXS", [
      txt("Reliability columns are scored against the statewide target (Interstate ≥ 75%, Non-Interstate ≥ 70%, TTTR ≤ 2.0). "),
      txt("PHED total", true),
      txt(" (annual hours) is a diagnostic — PHED has no MPO target; it’s a UZA measure (see Urban congestion below)."),
    ]),
  ], { top: "2", left: "2", right: "0", bottom: "2" }),

  sec05head: block([
    styled("kicker", [txt("// 05   Urban congestion · CMAQ · per UZA")]),
    heading("Peak-hour delay & non-SOV travel — the two CMAQ measures."),
    styled("proseSM", [
      txt("These apply only to UZAs over "),
      txt("200k population", true),
      txt(" in CMAQ "),
      txt("nonattainment/maintenance", true),
      txt(", against per-UZA targets. PHED is "),
      txt("per capita", true),
      txt(" (total hours ÷ UZA population, joined at build time)."),
    ]),
  ]),

  sec05note: block([
    styled("kicker", [txt("Not required to report · 11 other NY UZAs")]),
    styled("proseXS", [
      txt("Buffalo, Rochester, Albany-Schenectady & Syracuse clear 200k but are in "),
      txt("attainment", true),
      txt("; the rest (Binghamton, Utica, Saratoga Springs, Kingston, Glens Falls, Ithaca, Elmira) are "),
      txt("below 200k", true),
      txt(" — none report PHED or Non-SOV."),
    ]),
  ], { top: "2", left: "2", right: "0", bottom: "2" }),
};

for (const [name, data] of Object.entries(sections)) {
  fs.writeFileSync(`/tmp/${name}.json`, JSON.stringify(data));
  console.log("wrote", `/tmp/${name}.json`);
}
