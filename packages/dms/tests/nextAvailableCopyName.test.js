/**
 * Regression tests for the `undefined_copy` pattern chain.
 *
 * `patternList.jsx` hand-rolled `${editingItem.name}_copy`. With no name that
 * interpolates to the *string* "undefined_copy" — a perfectly valid slug, so
 * nothing downstream complained. Duplicating that gave `undefined_copy_copy`,
 * then `undefined_copy_copy_copy`: three generations in mitigat-ny-prod, each
 * dragging ~3,700 components (~177 MB) along with it, which is a large part of
 * how the app's Falcor response crossed V8's 512 MiB string limit and
 * crash-looped the server.
 *
 * See planning/tasks/current/falcor-response-string-limit-crash.md.
 *
 * Run: npx vitest run packages/dms/tests/nextAvailableCopyName.test.js
 */

import { describe, it, expect } from "vitest";

import { nextAvailableCopyName, FALLBACK_COPY_BASE } from "../src/utils/type-utils.js";

describe("nextAvailableCopyName — the undefined_copy hole", () => {
  it("never produces 'undefined_copy' when the name is missing", () => {
    for (const missing of [undefined, null, "", "   ", 0, false, NaN, {}, []]) {
      const { name, slug } = nextAvailableCopyName(missing, []);
      expect(name).not.toMatch(/undefined/);
      expect(slug).not.toMatch(/undefined/);
      expect(name).toBe(`${FALLBACK_COPY_BASE}_copy`);
    }
  });

  it("treats a literal 'undefined'/'null' name as missing too", () => {
    // This is what an earlier interpolation bug leaves behind; nobody names a
    // pattern that, and stacking on it is how generations 2 and 3 appeared.
    expect(nextAvailableCopyName("undefined", []).name).toBe(`${FALLBACK_COPY_BASE}_copy`);
    expect(nextAvailableCopyName("null", []).name).toBe(`${FALLBACK_COPY_BASE}_copy`);
  });

  it("the fallback still avoids sibling collisions", () => {
    const { name, slug } = nextAvailableCopyName(undefined, ["untitled_copy", "untitled_copy_2"]);
    expect(name).toBe("untitled_copy_3");
    expect(slug).toBe("untitled_copy_3");
  });
});

describe("nextAvailableCopyName — normal behaviour is unchanged", () => {
  it("appends _copy to a plain name", () => {
    expect(nextAvailableCopyName("Sullivan Template", [])).toEqual({
      name: "Sullivan Template_copy",
      slug: "sullivan_template_copy",
      suffix: "_copy",
    });
  });

  it("stacks when duplicating an existing copy", () => {
    // Deliberate: a second copy may diverge from the first, so it stacks
    // rather than collapsing back to the original name.
    expect(nextAvailableCopyName("foo_copy", []).name).toBe("foo_copy_copy");
  });

  it("increments past taken sibling slugs", () => {
    expect(nextAvailableCopyName("foo", ["foo_copy"]).name).toBe("foo_copy_2");
    expect(nextAvailableCopyName("foo", ["foo_copy", "foo_copy_2"]).name).toBe("foo_copy_3");
  });

  it("reports the suffix so callers can apply it to base_url too", () => {
    const { suffix } = nextAvailableCopyName("foo", ["foo_copy"]);
    expect(suffix).toBe("_copy_2");
    expect(`/foo${suffix}`).toBe("/foo_copy_2");
  });

  it("trims a padded name rather than slugging the whitespace", () => {
    expect(nextAvailableCopyName("  foo  ", []).name).toBe("foo_copy");
  });

  it("ignores falsy entries in the sibling list", () => {
    expect(nextAvailableCopyName("foo", [null, undefined, ""]).name).toBe("foo_copy");
  });
});
