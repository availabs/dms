/**
 * A theme can set `defaultColorScheme: 'light' | 'dark'` — the scheme a viewer gets before
 * they've used the ThemeToggle. Unset keeps the old behaviour (follow the OS). A viewer's
 * saved toggle choice always wins.
 *
 * See planning/tasks/current/theme-default-color-scheme.md.
 *
 * Run: npx vitest run packages/dms/tests/themeDefaultColorScheme.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applySavedColorScheme } from "../src/ui/components/ThemeToggle";
import { getPatternColorScheme } from "../src/render/spa/utils/PatternColorScheme";

// No DOM environment in this suite — a minimal <html> + localStorage + matchMedia stand-in.
let attrs, stored, osDark;
beforeEach(() => {
  attrs = {};
  stored = null;
  osDark = false;
  globalThis.document = {
    documentElement: {
      setAttribute: (k, v) => { attrs[k] = v; },
      removeAttribute: (k) => { delete attrs[k]; },
      getAttribute: (k) => attrs[k] ?? null,
    },
  };
  globalThis.window = {
    localStorage: { getItem: () => stored },
    matchMedia: () => ({ matches: osDark }),
  };
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

describe("applySavedColorScheme", () => {
  it("no saved choice, no theme default: follows the OS (unchanged behaviour)", () => {
    osDark = true;
    expect(applySavedColorScheme()).toBe(true);
    expect(attrs["data-theme"]).toBe("dark");
    osDark = false;
    expect(applySavedColorScheme()).toBe(false);
    expect(attrs["data-theme"]).toBeUndefined();
  });

  it("theme default beats the OS", () => {
    osDark = true;
    expect(applySavedColorScheme("light")).toBe(false);
    expect(attrs["data-theme"]).toBeUndefined();
    osDark = false;
    expect(applySavedColorScheme("dark")).toBe(true);
    expect(attrs["data-theme"]).toBe("dark");
  });

  it("the viewer's saved choice beats the theme default", () => {
    stored = "dark";
    expect(applySavedColorScheme("light")).toBe(true);
    stored = "light";
    expect(applySavedColorScheme("dark")).toBe(false);
    expect(attrs["data-theme"]).toBeUndefined();
  });

  it("ignores anything but 'light' / 'dark' (e.g. a cleared editor value)", () => {
    osDark = true;
    for (const v of [[], "", "auto", null]) expect(applySavedColorScheme(v)).toBe(true);
  });
});

describe("getPatternColorScheme", () => {
  const themes = { default: {}, brand: { defaultColorScheme: "light" }, night: { defaultColorScheme: "dark" } };

  it("reads the selected theme's value; unset = undefined", () => {
    expect(getPatternColorScheme(themes, { theme: { selectedTheme: "brand" } })).toBe("light");
    expect(getPatternColorScheme(themes, { theme: { settings: { theme: { theme: "night" } } } })).toBe("dark");
    expect(getPatternColorScheme(themes, { theme: {} })).toBeUndefined();
    expect(getPatternColorScheme(themes, {})).toBeUndefined();
  });

  it("a pattern's own theme override wins, including as a JSON string", () => {
    expect(getPatternColorScheme(themes, { theme: { selectedTheme: "brand", defaultColorScheme: "dark" } })).toBe("dark");
    expect(getPatternColorScheme(themes, { theme: JSON.stringify({ selectedTheme: "night" }) })).toBe("dark");
  });

  it("admin pattern (theme is the default theme object itself)", () => {
    expect(getPatternColorScheme({ default: { defaultColorScheme: "light" } }, { theme: { defaultColorScheme: "light" } })).toBe("light");
  });

  it("drops invalid values", () => {
    expect(getPatternColorScheme({ x: { defaultColorScheme: [] } }, { theme: { selectedTheme: "x" } })).toBeUndefined();
  });
});
