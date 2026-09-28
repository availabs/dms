/**
 * getPatternTheme caches `defaultTheme ⊕ themes[selection]` per theme registry
 * object (ui/useTheme.js, planning/tasks/current/boot-chain-fewer-serial-hops.md).
 *
 * Route building calls it once per pattern (110× on MitigateNY for ~3 themes);
 * the cache must be invisible: same output as the uncached code, and no
 * object handed out that another caller could mutate into the cache.
 */
import { describe, it, expect } from "vitest";
import { cloneDeep, set } from "lodash-es";
import defaultTheme from "../src/ui/defaultTheme";
import { getPatternTheme, mergeTheme } from "../src/ui/useTheme.js";

// The pre-cache implementation, verbatim in behaviour.
function uncached(themes, pattern) {
  const sel = pattern?.theme?.selectedTheme || pattern?.theme?.settings?.theme?.theme || "default";
  const base = mergeTheme(defaultTheme, themes?.[sel] || {});
  if (!pattern?.theme?.layout?.options) set(pattern, "theme.layout.options", cloneDeep(base?.layout?.options));
  delete base?.layout?.options;
  return mergeTheme(base, pattern?.theme || {});
}

const brand = {
  _replace: ["menu"],
  menu: ["a", "b"],
  fonts: [{ id: "brand-font", href: "/f.css" }],
  button: { options: { activeStyle: 0 }, styles: [{ name: "default Buttons", button: "brand-btn" }, { name: "cta", button: "cta" }] },
  layout: { options: { sideNav: { size: "compact" } }, wrapper: "brand-wrapper" },
};
const registry = () => ({ default: {}, brand });
const patterns = () => [
  { theme: { selectedTheme: "brand" } },
  { theme: { selectedTheme: "brand", layout: { options: { sideNav: { size: "none" } } }, button: { styles: [{ name: "default Buttons", button: "p-btn" }] } } },
  { theme: { settings: { theme: { theme: "brand" } } } },   // legacy selection path
  { theme: { selectedTheme: "missing" } },
  {},
];

describe("getPatternTheme base-merge cache", () => {
  it("returns exactly what the uncached code returned, for every pattern shape", () => {
    const themesA = registry(), themesB = registry();
    const pa = patterns(), pb = patterns();
    pa.forEach((p, i) => expect(getPatternTheme(themesA, p)).toEqual(uncached(themesB, pb[i])));
    // the pattern mutation (layout.options written when absent) is unchanged too
    expect(pa).toEqual(pb);
  });

  it("hands every caller its own object — mutating one result can't reach the next", () => {
    const themes = registry();
    const first = getPatternTheme(themes, { theme: { selectedTheme: "brand" } });
    first.layout.wrapper = "MUTATED";
    first.button.styles[0].button = "MUTATED";
    const second = getPatternTheme(themes, { theme: { selectedTheme: "brand" } });
    expect(second.layout.wrapper).toBe("brand-wrapper");
    expect(second.button.styles[0].button).toBe("brand-btn");
  });

  it("writes a fresh copy of the layout options onto a pattern that has none", () => {
    const themes = registry();
    const p1 = { theme: { selectedTheme: "brand" } };
    getPatternTheme(themes, p1);
    p1.theme.layout.options.sideNav.size = "MUTATED";
    const p2 = { theme: { selectedTheme: "brand" } };
    getPatternTheme(themes, p2);
    expect(p2.theme.layout.options.sideNav.size).toBe("compact");
  });

  it("a new registry object is recomputed (a changed theme is picked up)", () => {
    const t1 = registry();
    expect(getPatternTheme(t1, { theme: { selectedTheme: "brand" } }).layout.wrapper).toBe("brand-wrapper");
    const t2 = { default: {}, brand: { ...brand, layout: { ...brand.layout, wrapper: "v2" } } };
    expect(getPatternTheme(t2, { theme: { selectedTheme: "brand" } }).layout.wrapper).toBe("v2");
  });
});
