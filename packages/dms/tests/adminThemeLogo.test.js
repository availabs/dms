/**
 * Admin surfaces (admin pattern + auth manage pages) render the library default theme, taking
 * ONLY the `admin` key of the theme the auth pattern selects — its logo, and any per-page admin
 * overrides. Nothing else from that theme may leak in (that's what keeps adding an `admin` key
 * to a theme from changing anything outside admin).
 *
 * See planning/tasks/current/admin-theme-per-project.md.
 *
 * Run: npx vitest run packages/dms/tests/adminThemeLogo.test.js
 */

import { describe, it, expect } from "vitest";
import { getAdminTheme } from "../src/ui/useTheme";
import defaultTheme from "../src/ui/defaultTheme";

const brand = {
  button: { styles: [{ name: "default", button: "BRAND-BUTTON" }] },
  logo: { img: "/brand-site-logo.svg" }, // the theme's own (public-site) logo — NOT used by admin
  admin: {
    logo: { img: "", logoAltImg: "BRAND-MASK", title: "" },
    patternEditor: { headerTitle: "BRAND-HEADER" },
  },
};
const themes = { brand, plain: { button: brand.button } };
const auth = (theme) => ({ pattern_type: "auth", theme });

describe("getAdminTheme", () => {
  it("no auth pattern / no selected theme: default theme, blank 'Admin' logo", () => {
    for (const ap of [undefined, auth(undefined), auth({})]) {
      const t = getAdminTheme(themes, ap);
      expect(t.logo.img).toBe("");
      expect(t.logo.logoAltImg).toBe("");
      expect(t.logo.title).toBe("Admin");
      expect(t.logo.logoWrapper).toBe(defaultTheme.logo.logoWrapper);
    }
  });

  it("a theme without an admin key: blank logo, nothing from the theme applied", () => {
    const t = getAdminTheme(themes, auth({ selectedTheme: "plain" }));
    expect(t.logo.title).toBe("Admin");
    expect(JSON.stringify(t.button)).not.toContain("BRAND-BUTTON");
  });

  it("uses admin.logo merged over the default logo, and only the admin key", () => {
    const t = getAdminTheme(themes, auth({ selectedTheme: "brand" }));
    expect(t.logo.logoAltImg).toBe("BRAND-MASK");
    expect(t.logo.img).toBe(""); // not the theme's own top-level logo
    expect(t.logo.title).toBe("");
    expect(t.logo.logoWrapper).toBe(defaultTheme.logo.logoWrapper); // chrome stays default
    expect(JSON.stringify(t.button)).not.toContain("BRAND-BUTTON");
  });

  it("other admin sub-keys merge into the default theme.admin without clobbering it", () => {
    const t = getAdminTheme(themes, auth({ selectedTheme: "brand" }));
    expect(t.admin.patternEditor.headerTitle).toBe("BRAND-HEADER");
    expect(t.admin.navOptions).toEqual(defaultTheme.admin.navOptions);
  });

  it("honors the legacy selection path", () => {
    const t = getAdminTheme(themes, auth({ settings: { theme: { theme: "brand" } } }));
    expect(t.logo.logoAltImg).toBe("BRAND-MASK");
  });

  it("the auth pattern's own theme.admin overrides beat the theme's", () => {
    const t = getAdminTheme(themes, auth({ selectedTheme: "brand", admin: { logo: { title: "Pattern" } } }));
    expect(t.logo.title).toBe("Pattern");
    expect(t.logo.logoAltImg).toBe("BRAND-MASK");
  });

  it("admin.logo: {} shows the default logo (the tessera mark) instead of blanking it", () => {
    const t = getAdminTheme({ tess: { admin: { logo: {} } } }, auth({ selectedTheme: "tess" }));
    expect(t.logo.logoAltImg).toBe(defaultTheme.logo.logoAltImg);
    expect(t.logo.logoAltImg).not.toBe("");
  });

  it("does not mutate the source theme or the auth pattern", () => {
    const ap = auth({ selectedTheme: "brand" });
    const before = JSON.stringify([brand, ap]);
    getAdminTheme(themes, ap);
    expect(JSON.stringify([brand, ap])).toBe(before);
  });
});
